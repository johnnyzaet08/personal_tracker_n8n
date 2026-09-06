/** Run inside the n8n image, with the server stopped. Never exports/decrypts credentials. */
import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir, writeFile, chmod, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const require = createRequire('/usr/local/lib/node_modules/n8n/package.json');
const { Client } = require('pg');
const placeholder = 'GMAIL_OAUTH_CREDENTIAL_REQUIRED';
const input = resolve(process.argv[2] ?? '/workflows');
const validationBefore = process.env.GMAIL_VALIDATION_BEFORE;
const validationSourceFile = process.env.GMAIL_VALIDATION_SOURCE_FILE;
const client = new Client({
  host: process.env.DB_POSTGRESDB_HOST,
  port: Number(process.env.DB_POSTGRESDB_PORT ?? 5432),
  database: process.env.DB_POSTGRESDB_DATABASE,
  user: process.env.DB_POSTGRESDB_USER,
  password: process.env.DB_POSTGRESDB_PASSWORD,
});
const staging = await mkdtemp(join(tmpdir(), 'tracker-workflows-'));
await chmod(staging, 0o700);
let connected = false;
try {
  await client.connect();
  connected = true;
  const files = (await readdir(input)).filter((name) => name.endsWith('.json')).sort();
  const workflows = await Promise.all(
    files.map(async (name) => JSON.parse(await readFile(join(input, name), 'utf8'))),
  );
  let validationQuery;
  if (validationBefore || validationSourceFile) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(validationBefore ?? '') || !validationSourceFile)
      throw new Error('INVALID_VALIDATION_WINDOW');
    const source = JSON.parse(await readFile(validationSourceFile, 'utf8'));
    if (
      typeof source.senderAddress !== 'string' ||
      !/^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,63}$/u.test(source.senderAddress)
    )
      throw new Error('INVALID_VALIDATION_SOURCE');
    const before = new Date(`${validationBefore}T00:00:00-06:00`);
    const after = new Date(`${validationBefore.slice(0, 7)}-01T00:00:00-06:00`);
    if (!Number.isFinite(before.getTime()) || before <= after)
      throw new Error('INVALID_VALIDATION_WINDOW');
    validationQuery = `is:unread from:${source.senderAddress} after:${Math.floor(after.getTime() / 1000)} before:${Math.floor(before.getTime() / 1000)} -in:spam -in:trash`;
  }
  const exists = await client.query(
    "SELECT to_regclass('public.workflow_entity') IS NOT NULL AS ready",
  );
  let previous = new Map();
  let credential;
  if (exists.rows[0]?.ready) {
    const rows = await client.query(
      'SELECT id, nodes, active, "staticData" FROM workflow_entity WHERE id = ANY($1::varchar[])',
      [workflows.map((workflow) => workflow.id)],
    );
    previous = new Map(rows.rows.map((row) => [row.id, row]));
    const existing = previous.get('10000000-0000-4000-8000-000000000000');
    const bound = (existing?.nodes ?? [])
      .map((node) => node.credentials?.gmailOAuth2)
      .find((binding) => binding?.id && binding.id !== placeholder);
    // Only opaque references and display names are selected; encrypted credential data is never read.
    const credentials = await client.query(
      'SELECT id, name FROM credentials_entity WHERE type = $1',
      ['gmailOAuth2'],
    );
    credential = bound
      ? credentials.rows.find((entry) => entry.id === bound.id)
      : credentials.rows.length === 1
        ? credentials.rows[0]
        : undefined;
    if (bound && !credential) throw new Error('GMAIL_BINDING_NOT_FOUND');
    if (!bound && credentials.rows.length > 1) throw new Error('GMAIL_BINDING_AMBIGUOUS');
  }
  let boundNodes = 0;
  for (let i = 0; i < workflows.length; i += 1) {
    const workflow = workflows[i];
    const prior = previous.get(workflow.id);
    workflow.active = Boolean(prior?.active);
    delete workflow.pinData;
    // Preserve only the polling cursor; no arbitrary workflow static data is copied.
    if (prior?.staticData && workflow.id.endsWith('000000000000')) {
      const key = 'node:Gmail Trigger - Credential Required';
      const state = prior.staticData[key];
      if (state && typeof state === 'object') workflow.staticData = { [key]: state };
    }
    for (const node of workflow.nodes) {
      if (node.credentials?.gmailOAuth2?.id === placeholder && credential) {
        node.credentials.gmailOAuth2 = { id: credential.id, name: credential.name };
        boundNodes += 1;
      }
      if (validationQuery && node.type === 'n8n-nodes-base.gmailTrigger')
        node.parameters.filters.q = validationQuery;
      if (validationQuery && node.name === 'List ten unread messages') {
        node.parameters.queryParameters.parameters.find(
          (parameter) => parameter.name === 'q',
        ).value = validationQuery;
      }
    }
    // The authenticated asynchronous webhooks must be available after deployment.
    if (
      ['10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003'].includes(
        workflow.id,
      )
    ) {
      workflow.active = Boolean(credential);
    }
    workflow.settings = {
      ...workflow.settings,
      saveDataErrorExecution: 'none',
      saveDataSuccessExecution: 'none',
      saveManualExecutions: false,
      saveExecutionProgress: false,
    };
    await writeFile(join(staging, files[i]), JSON.stringify(workflow), { mode: 0o600 });
  }
  // Production sub-workflow calls require published versions in n8n 2.37.4.
  // Publish the full dependency closure, while leaving an inactive Gmail trigger inactive.
  const byId = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  const roots = workflows.filter((workflow) => workflow.active);
  if (credential) roots.push(byId.get('10000000-0000-4000-8000-000000000090'));
  const pending = roots.filter(Boolean);
  const visited = new Set();
  while (pending.length) {
    const workflow = pending.pop();
    if (visited.has(workflow.id)) continue;
    visited.add(workflow.id);
    workflow.active = true;
    const dependencies = workflow.nodes
      .filter((node) => node.type === 'n8n-nodes-base.executeWorkflow')
      .map((node) =>
        typeof node.parameters.workflowId === 'string'
          ? node.parameters.workflowId
          : node.parameters.workflowId?.value,
      );
    if (workflow.settings.errorWorkflow) dependencies.push(workflow.settings.errorWorkflow);
    for (const dependency of dependencies) {
      const target = byId.get(dependency);
      if (!target) throw new Error('WORKFLOW_DEPENDENCY_NOT_FOUND');
      pending.push(target);
    }
  }
  const result = spawnSync('n8n', ['import:workflow', '--separate', `--input=${staging}`], {
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: 8 * 1024 * 1024,
  });
  // CLI output may contain node references; print only a controlled status, never stdout/stderr.
  if (result.status !== 0) throw new Error('WORKFLOW_IMPORT_FAILED');
  // n8n 2.37.4 rejects --activeState=fromJson in regular mode. Import inactive,
  // then publish through its supported CLI while the server remains stopped.
  const activeWorkflows = workflows.filter((workflow) => workflow.active);
  for (const workflow of activeWorkflows) {
    const published = spawnSync('n8n', ['publish:workflow', `--id=${workflow.id}`], {
      encoding: 'utf8',
      stdio: 'pipe',
      maxBuffer: 8 * 1024 * 1024,
    });
    if (published.status !== 0) throw new Error('WORKFLOW_PUBLISH_FAILED');
  }
  const imported = await client.query(
    'SELECT id, nodes, settings, active, "activeVersionId" FROM workflow_entity WHERE id = ANY($1::varchar[])',
    [workflows.map((workflow) => workflow.id)],
  );
  if (imported.rows.length !== workflows.length) throw new Error('WORKFLOW_IMPORT_VERIFY_FAILED');
  for (const workflow of workflows) {
    const saved = imported.rows.find((row) => row.id === workflow.id);
    const bindings = saved?.nodes
      ?.filter((node) => node.credentials?.gmailOAuth2)
      .map((node) => node.credentials.gmailOAuth2.id);
    if (
      !saved ||
      saved.active !== workflow.active ||
      Boolean(saved.activeVersionId) !== workflow.active ||
      saved.nodes.length !== workflow.nodes.length ||
      saved.settings.saveDataErrorExecution !== 'none' ||
      saved.settings.saveDataSuccessExecution !== 'none' ||
      saved.settings.saveManualExecutions !== false ||
      saved.settings.saveExecutionProgress !== false ||
      bindings.some((binding) => binding !== (credential?.id ?? placeholder))
    )
      throw new Error('WORKFLOW_IMPORT_VERIFY_FAILED');
  }
  console.log(
    JSON.stringify({
      imported: workflows.length,
      gmailCredentialBound: Boolean(credential),
      boundNodes,
      published: activeWorkflows.length,
      manualWebhooksEnabled: Boolean(credential),
      credentialDataRead: false,
      validationWindowApplied: Boolean(validationQuery),
    }),
  );
} catch (error) {
  const allowed = new Set([
    'GMAIL_BINDING_NOT_FOUND',
    'GMAIL_BINDING_AMBIGUOUS',
    'WORKFLOW_IMPORT_FAILED',
    'WORKFLOW_PUBLISH_FAILED',
    'WORKFLOW_IMPORT_VERIFY_FAILED',
    'WORKFLOW_DEPENDENCY_NOT_FOUND',
  ]);
  console.error(allowed.has(error?.message) ? error.message : 'SAFE_WORKFLOW_IMPORT_FAILED');
  process.exitCode = 1;
} finally {
  if (connected) await client.end();
  await rm(staging, { recursive: true, force: true });
}
