import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'workflows');
const required = new Set([
  '00 - Gmail - Ingestion',
  '01 - Email - Router',
  '02 - Gmail - Reconciliation Preview',
  '03 - Gmail - Process Selected Messages',
  '05 - Local - Email Fixture Ingestion',
  '10 - Finance - Process Candidate',
  '20 - Important Email - Process',
  '90 - Review Queue',
  '98 - System - Connectivity Check',
  '99 - Error Handler',
]);
const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
const ids = new Set();
for (const file of files) {
  const workflow = JSON.parse(await readFile(resolve(directory, file), 'utf8'));
  if (!workflow.id || !workflow.name || !Array.isArray(workflow.nodes) || !workflow.connections) {
    throw new Error(`${file} is not a complete n8n workflow export`);
  }
  if (ids.has(workflow.id)) throw new Error(`Duplicate workflow id ${workflow.id}`);
  ids.add(workflow.id);
  required.delete(workflow.name);
  const settings = workflow.settings ?? {};
  if (
    settings.saveDataErrorExecution !== 'none' ||
    settings.saveDataSuccessExecution !== 'none' ||
    settings.saveManualExecutions !== false ||
    settings.saveExecutionProgress !== false
  ) {
    throw new Error(`${file} could retain transient email content in execution storage`);
  }
  if (workflow.pinData && Object.keys(workflow.pinData).length)
    throw new Error(`${file} contains pinned data`);
  const nodes = new Set(workflow.nodes.map((node) => node.name));
  for (const [from, connections] of Object.entries(workflow.connections)) {
    if (!nodes.has(from)) throw new Error(`${file} contains a dangling source connection`);
    for (const outputs of Object.values(connections))
      for (const output of outputs) {
        for (const edge of output)
          if (!nodes.has(edge.node))
            throw new Error(`${file} contains a dangling destination connection`);
      }
  }
  for (const node of workflow.nodes) {
    if (
      node.credentials?.gmailOAuth2 &&
      (node.credentials.gmailOAuth2.id !== 'GMAIL_OAUTH_CREDENTIAL_REQUIRED' ||
        node.credentials.gmailOAuth2.name !== 'GMAIL_OAUTH_CREDENTIAL_REQUIRED')
    ) {
      throw new Error(`${file} contains a runtime Gmail credential binding`);
    }
    if (
      node.type === 'n8n-nodes-base.httpRequest' &&
      node.parameters.nodeCredentialType === 'gmailOAuth2'
    ) {
      if (
        node.parameters.method !== 'GET' ||
        /attachments|modify|trash|send/iu.test(node.parameters.url)
      ) {
        throw new Error(`${file} contains a Gmail operation beyond read-only message retrieval`);
      }
    }
  }
  if (workflow.name === '00 - Gmail - Ingestion') {
    if (workflow.active) throw new Error('Gmail workflow must remain inactive in source control');
    if (!JSON.stringify(workflow).includes('GMAIL_OAUTH_CREDENTIAL_REQUIRED')) {
      throw new Error('Gmail workflow is missing the credential placeholder');
    }
  }
}
if (required.size > 0) throw new Error(`Missing workflows: ${[...required].join(', ')}`);
console.log(`Validated ${files.length} versioned workflows.`);
