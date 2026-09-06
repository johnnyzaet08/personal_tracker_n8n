import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const directory = resolve(import.meta.dirname, '../workflows');
const load = (prefix) =>
  JSON.parse(
    readFileSync(
      resolve(
        directory,
        readdirSync(directory).find((file) => file.startsWith(prefix)),
      ),
      'utf8',
    ),
  );
const workflow00 = load('00-');
const workflow02 = load('02-');
const workflow03 = load('03-');
const workflow10 = load('10-');
const node = (workflow, name) => workflow.nodes.find((item) => item.name === name);
const tenantId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const refs = {
  'Load authorized run context': [
    {
      json: {
        run: { id: runId, tenantId },
        messageIds: ['chosen-message'],
        query: 'is:unread from:alerts@bank.example',
      },
    },
  ],
  'Validate run identifiers': [{ json: { tenantId, runId } }],
};
const getRef = (references) => (name) => ({
  first: () => references[name][0],
  all: () => references[name],
});
const execute = (workflow, name, input, references = refs) =>
  new Function('$input', '$json', '$', '$env', node(workflow, name).parameters.jsCode)(
    { all: () => input },
    input[0]?.json ?? {},
    getRef(references),
    { LOCAL_TENANT_ID: tenantId },
  );
const evaluate = (expression, json, references = refs) =>
  new Function('$json', '$env', '$', '$execution', `return (${expression.slice(3, -2)});`)(
    json,
    { API_INTERNAL_URL: 'http://api:3001' },
    getRef(references),
    { id: 'synthetic-execution' },
  );

test('all versioned Code nodes compile as JavaScript', () => {
  for (const filename of readdirSync(directory).filter((file) => file.endsWith('.json'))) {
    const workflow = JSON.parse(readFileSync(resolve(directory, filename), 'utf8'));
    for (const item of workflow.nodes.filter((entry) => entry.type.endsWith('.code')))
      assert.doesNotThrow(() => new Function(item.parameters.jsCode));
  }
});
test('automatic trigger discards malformed unrelated senders before API calls', () => {
  const result = execute(workflow00, 'Keep minimum sender metadata', [
    {
      json: { id: 'synthetic-1', From: 'Bank <ALERTS@BANK.EXAMPLE>', snippet: 'DO NOT PROPAGATE' },
    },
    { json: { id: 'synthetic-2', From: 'malformed sender' } },
    { json: { id: 'synthetic-3', From: 'a@bank.example,b@bank.example' } },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].json.sender, 'alerts@bank.example');
  assert.equal(result[0].json.snippet, undefined);
  const gated = execute(workflow00, 'Discard unconfigured senders', [{ json: { source: null } }], {
    'Keep minimum sender metadata': result,
  });
  assert.equal(gated.length, 0);
});
test('preview bounds messages to ten and handles empty/provider errors explicitly', () => {
  const messages = Array.from({ length: 25 }, (_, index) => ({ id: `message-${index}` }));
  assert.equal(
    execute(workflow02, 'Validate list and bound message IDs', [
      { json: { statusCode: 200, body: { messages } } },
    ]).length,
    10,
  );
  assert.deepEqual(
    execute(workflow02, 'Validate list and bound message IDs', [
      { json: { statusCode: 200, body: {} } },
    ]),
    [{ json: { failed: false, empty: true } }],
  );
  const failed = execute(workflow02, 'Validate list and bound message IDs', [
    { json: { statusCode: 401, body: { error: 'DO NOT PROPAGATE' } } },
  ]);
  assert.deepEqual(failed, [{ json: { failed: true } }]);
});
test('manual provider fetch uses API-authorized selection only', () => {
  const selected = execute(workflow03, 'Only explicitly selected pending IDs', [
    { json: { messageIds: ['UNAUTHORIZED'] } },
  ]);
  assert.deepEqual(selected, [{ json: { messageId: 'chosen-message', empty: false } }]);
  const oversized = {
    'Load authorized run context': [
      { json: { messageIds: Array.from({ length: 11 }, (_, i) => `message-${i}`) } },
    ],
  };
  assert.throws(
    () => execute(workflow03, 'Only explicitly selected pending IDs', [], oversized),
    /SELECTION_LIMIT_EXCEEDED/u,
  );
});
test('automatic and selected paths reach the same API parser with correct URLs', () => {
  const endpoint = node(workflow10, 'Parse observe and reconcile through API').parameters.url;
  assert.equal(
    evaluate(endpoint, { mode: 'automatic' }),
    'http://api:3001/internal/v1/email-ingestion/automatic',
  );
  assert.equal(
    evaluate(endpoint, { mode: 'selected', runId }),
    `http://api:3001/internal/v1/email-sync-runs/${runId}/process-message`,
  );
  for (const prefix of [workflow00, workflow03])
    assert.ok(
      prefix.nodes.some(
        (entry) =>
          entry.type.endsWith('.executeWorkflow') &&
          entry.parameters.workflowId.value.endsWith('000000000001'),
      ),
    );
});
test('unauthenticated webhook never obtains an internal credential before provider access', () => {
  for (const workflow of [workflow02, workflow03]) {
    const context = node(workflow, 'Load authorized run context');
    const header = context.parameters.headerParameters.parameters.find(
      (entry) => entry.name === 'x-internal-api-key',
    );
    assert.equal(
      evaluate(header.value, {}, { 'Internal webhook': [{ json: { headers: {} } }] }),
      '',
    );
    assert.equal(
      evaluate(
        header.value,
        {},
        { 'Internal webhook': [{ json: { headers: { 'x-internal-api-key': 'synthetic-key' } } }] },
      ),
      'synthetic-key',
    );
    assert.ok(!header.value.includes('$env.INTERNAL_API_KEY'));
    assert.equal(context.continueOnFail, undefined);
    assert.equal(context.parameters.options.response.response.neverError, undefined);
  }
});
test('upstream failures become fixed codes and partially completed runs report to API', () => {
  const failure = execute(workflow10, 'Return sanitized reconciliation result', [
    { json: { statusCode: 500, body: { html: 'DO NOT PROPAGATE' } } },
  ]);
  assert.deepEqual(failure, [{ json: { failed: true, errorCode: 'API_RECONCILIATION_FAILED' } }]);
  assert.equal(
    execute(workflow03, 'Sanitize batch completion', [
      { json: { classification: 'new' } },
      ...failure,
    ])[0].json.failed,
    true,
  );
  assert.ok(
    workflow03.connections['Any reconciliation failed?'].main[0].some(
      (edge) => edge.node === 'Report sanitized failure',
    ),
  );
});
test('Gmail requests are readonly and do not request inline attachments', () => {
  for (const workflow of [workflow00, workflow02, workflow03])
    for (const item of workflow.nodes.filter(
      (entry) => entry.parameters.nodeCredentialType === 'gmailOAuth2',
    )) {
      assert.equal(item.parameters.method, 'GET');
      assert.ok(!item.parameters.url.includes('attachments'));
      const query = Object.fromEntries(
        item.parameters.queryParameters.parameters.map((entry) => [entry.name, entry.value]),
      );
      if (query.format) assert.equal(query.format, 'full');
      else {
        assert.equal(query.maxResults, '10');
        assert.equal(query.labelIds, 'UNREAD');
      }
    }
});

test('fatal shared sub-workflow failure completes the run with a fixed sanitized error', () => {
  const router = node(workflow03, 'Execute shared email router');
  assert.equal(router.onError, 'continueErrorOutput');
  assert.deepEqual(workflow03.connections[router.name].main[1], [
    { node: 'Report sanitized failure', type: 'main', index: 0 },
  ]);
  const failure = node(workflow03, 'Report sanitized failure');
  assert.deepEqual(
    JSON.parse(
      evaluate(failure.parameters.body, {
        error: { message: 'PRIVATE FAILURE DETAIL', stack: 'PRIVATE STACK' },
        message: { body: 'PRIVATE BODY' },
      }),
    ),
    { tenantId, errorCode: 'GMAIL_EXECUTION_FAILED' },
  );
});
