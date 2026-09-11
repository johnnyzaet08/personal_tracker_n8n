import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve(import.meta.dirname, '../workflows');
const workflowId = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const credentials = {
  gmailOAuth2: { id: 'GMAIL_OAUTH_CREDENTIAL_REQUIRED', name: 'GMAIL_OAUTH_CREDENTIAL_REQUIRED' },
};
const settings = {
  executionOrder: 'v1',
  errorWorkflow: workflowId(99),
  saveDataErrorExecution: 'none',
  saveDataSuccessExecution: 'none',
  saveManualExecutions: false,
  saveExecutionProgress: false,
};
let current = 0;
let index = 0;
const node = (name, type, parameters = {}, extra = {}) => ({
  parameters,
  id: `${String(current).padStart(8, '0')}-0000-4000-8000-${String(++index).padStart(12, '0')}`,
  name,
  type: `n8n-nodes-base.${type}`,
  typeVersion:
    {
      code: 2,
      httpRequest: 4.2,
      if: 2.2,
      webhook: 2.1,
      executeWorkflow: 1.3,
      executeWorkflowTrigger: 1.1,
      gmailTrigger: 1.4,
    }[type] ?? 1,
  position: [120 + index * 220, 300],
  ...extra,
});
const code = (name, jsCode) => node(name, 'code', { jsCode });
const branch = (name, leftValue) =>
  node(name, 'if', {
    conditions: {
      options: { caseSensitive: true, typeValidation: 'strict', version: 2 },
      conditions: [
        {
          id: 'condition',
          leftValue,
          rightValue: true,
          operator: { type: 'boolean', operation: 'true', singleValue: true },
        },
      ],
      combinator: 'and',
    },
    options: {},
  });
const trigger = (name) => node(name, 'executeWorkflowTrigger', { inputSource: 'passthrough' });
const execute = (name, id) =>
  node(name, 'executeWorkflow', {
    workflowId: { __rl: true, value: workflowId(id), mode: 'id' },
    options: { waitForSubWorkflow: true },
  });
const api = (name, path, body, options = {}) =>
  node(
    name,
    'httpRequest',
    {
      method: body ? 'POST' : 'GET',
      url: `={{ $env.API_INTERNAL_URL + (${path}) }}`,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          {
            name: 'x-internal-api-key',
            value: options.incomingAuth
              ? "={{ $('Internal webhook').first().json.headers['x-internal-api-key'] ?? '' }}"
              : '={{ $env.INTERNAL_API_KEY }}',
          },
          {
            name: 'x-tenant-id',
            value:
              options.tenant ??
              "={{ $json.tenantId ?? $json.run?.tenantId ?? $('Validate run identifiers').first().json.tenantId }}",
          },
          {
            name: 'x-correlation-id',
            value: options.correlation ?? '={{ $json.correlationId ?? $execution.id }}',
          },
        ],
      },
      ...(body
        ? {
            sendBody: true,
            contentType: 'raw',
            rawContentType: 'application/json',
            body: `={{ JSON.stringify(${body}) }}`,
          }
        : {}),
      options: {
        timeout: 30000,
        response: {
          response: {
            responseFormat: 'json',
            ...(options.safeResult ? { fullResponse: true, neverError: true } : {}),
          },
        },
      },
    },
    options.extra ?? {},
  );
const gmail = (name, list = false) =>
  node(
    name,
    'httpRequest',
    {
      method: 'GET',
      url: list
        ? 'https://gmail.googleapis.com/gmail/v1/users/me/messages'
        : "={{ 'https://gmail.googleapis.com/gmail/v1/users/me/messages/' + encodeURIComponent($json.messageId) }}",
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'gmailOAuth2',
      sendQuery: true,
      queryParameters: {
        parameters: list
          ? [
              { name: 'q', value: "={{ $('Load authorized run context').first().json.query }}" },
              { name: 'maxResults', value: '10' },
              { name: 'labelIds', value: 'UNREAD' },
              { name: 'includeSpamTrash', value: 'false' },
            ]
          : [{ name: 'format', value: 'full' }],
      },
      options: {
        timeout: 30000,
        response: { response: { responseFormat: 'json', fullResponse: true, neverError: true } },
      },
    },
    {
      credentials,
      retryOnFail: true,
      maxTries: 2,
      waitBetweenTries: 1000,
      notes: 'Read-only Gmail GET. No modify/mark-read operation and no attachment fetch.',
    },
  );
function connections(edges) {
  const result = {};
  for (const [from, to, output = 0] of edges) {
    result[from] ??= { main: [] };
    while (result[from].main.length <= output) result[from].main.push([]);
    result[from].main[output].push({ node: to, type: 'main', index: 0 });
  }
  return result;
}
async function save(number, filename, name, build) {
  current = number;
  index = 0;
  const { nodes, edges } = build();
  await writeFile(
    resolve(directory, filename),
    `${JSON.stringify({ id: workflowId(number), name, active: false, nodes, connections: connections(edges), settings, versionId: `${String(number).padStart(8, '0')}-0000-4000-8000-000000000099`, tags: [] }, null, 2)}\n`,
  );
}

await save(0, '00-gmail-ingestion.json', '00 - Gmail - Ingestion', () => ({
  nodes: [
    node(
      'Gmail Trigger - Credential Required',
      'gmailTrigger',
      {
        pollTimes: { item: [{ mode: 'everyMinute' }] },
        simple: true,
        maxResults: 10,
        filters: { readStatus: 'unread', q: 'is:unread -in:spam -in:trash', includeDrafts: false },
      },
      {
        credentials,
        notes:
          'Metadata only. Runtime sources are checked through the API before fetching content. Credential placeholder is replaced only inside encrypted n8n runtime storage.',
      },
    ),
    code(
      'Keep minimum sender metadata',
      "return $input.all().flatMap(({json:m},index) => { const from=typeof m.From==='string'?m.From:typeof m.from==='string'?m.from:''; const match=from.match(/^(?:[^<>]*)<([^<>]+)>$/); const sender=(match?.[1] ?? from).trim().toLowerCase(); if(sender.length>320 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9][a-z0-9.-]*\\.[a-z]{2,63}$/.test(sender) || typeof m.id!=='string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(m.id))return []; return [{json:{tenantId:$env.LOCAL_TENANT_ID,messageId:m.id,sender,correlationId:m.id},pairedItem:{item:index}}]; });",
    ),
    api(
      'Match enabled automatic source',
      "'/internal/v1/email-sources/match?tenantId=' + encodeURIComponent($json.tenantId) + '&mode=automatic&sender=' + encodeURIComponent($json.sender)",
    ),
    code(
      'Discard unconfigured senders',
      "return $input.all().flatMap((item,index) => item.json.source ? [{json:{tenantId:item.json.source.tenantId,messageId:$('Keep minimum sender metadata').all()[index].json.messageId},pairedItem:{item:index}}] : []);",
    ),
    gmail('Retrieve full Gmail message'),
    code(
      'Prepare transient connector envelope',
      "return $input.all().map(({json:r}) => {if(r.statusCode!==200 || !r.body?.id) throw new Error('GMAIL_READ_FAILED'); return {json:{tenantId:$env.LOCAL_TENANT_ID,mode:'automatic',message:r.body}};});",
    ),
    execute('Execute email router', 1),
  ],
  edges: [
    ['Gmail Trigger - Credential Required', 'Keep minimum sender metadata'],
    ['Keep minimum sender metadata', 'Match enabled automatic source'],
    ['Match enabled automatic source', 'Discard unconfigured senders'],
    ['Discard unconfigured senders', 'Retrieve full Gmail message'],
    ['Retrieve full Gmail message', 'Prepare transient connector envelope'],
    ['Prepare transient connector envelope', 'Execute email router'],
  ],
}));

await save(1, '01-email-router.json', '01 - Email - Router', () => ({
  nodes: [trigger('Transient email connector input'), execute('Shared finance reconciliation', 10)],
  edges: [['Transient email connector input', 'Shared finance reconciliation']],
}));

await save(10, '10-finance-process-candidate.json', '10 - Finance - Process Candidate', () => ({
  nodes: [
    trigger('Transient connector envelope'),
    api(
      'Parse observe and reconcile through API',
      "$json.mode === 'selected' ? '/internal/v1/email-sync-runs/' + encodeURIComponent($json.runId) + '/process-message' : '/internal/v1/email-ingestion/automatic'",
      '{tenantId:$json.tenantId,message:$json.message}',
      {
        safeResult: true,
        extra: {
          notes:
            'NestJS owns one MIME parser, institution adapter, minimal observation, ledger identity, and review reconciliation transaction. The response contains only sanitized results.',
        },
      },
    ),
    code(
      'Return sanitized reconciliation result',
      "return $input.all().map(({json:r}) => r.statusCode>=200&&r.statusCode<300?{json:r.body}:{json:{failed:true,errorCode:'API_RECONCILIATION_FAILED'}});",
    ),
  ],
  edges: [
    ['Transient connector envelope', 'Parse observe and reconcile through API'],
    ['Parse observe and reconcile through API', 'Return sanitized reconciliation result'],
  ],
}));

function manualBase(path, state) {
  return [
    node(
      'Internal webhook',
      'webhook',
      { httpMethod: 'POST', path, responseMode: 'onReceived', options: { responseCode: 202 } },
      {
        webhookId: `tracker-${path}`,
        notes:
          'Only the caller-supplied service header is forwarded to the API context endpoint. Its constant-time guard must succeed before any Gmail action. Payload/header execution storage is disabled.',
      },
    ),
    code(
      'Validate run identifiers',
      "const body=$json.body ?? {}; const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i; if(!uuid.test(body.tenantId ?? '') || !uuid.test(body.runId ?? '')) throw new Error('INVALID_SYNC_REQUEST'); return [{json:{tenantId:body.tenantId,runId:body.runId,correlationId:body.correlationId ?? body.runId}}];",
    ),
    api(
      'Load authorized run context',
      "'/internal/v1/email-sync-runs/' + $json.runId + '/context?tenantId=' + $json.tenantId",
      null,
      { incomingAuth: true },
    ),
    api(
      'Report run progress',
      "'/internal/v1/email-sync-runs/' + $('Load authorized run context').first().json.run.id + '/progress'",
      `{tenantId:$('Load authorized run context').first().json.run.tenantId,status:'${state}'}`,
      {
        tenant: "={{ $('Load authorized run context').first().json.run.tenantId }}",
        correlation: "={{ $('Validate run identifiers').first().json.correlationId }}",
      },
    ),
  ];
}
const baseEdges = [
  ['Internal webhook', 'Validate run identifiers'],
  ['Validate run identifiers', 'Load authorized run context'],
  ['Load authorized run context', 'Report run progress'],
];
const runPath = (suffix) =>
  `'/internal/v1/email-sync-runs/' + $('Load authorized run context').first().json.run.id + '/${suffix}'`;
const runTenant =
  "$ ('Load authorized run context')".replace('$ ', '$') + '.first().json.run.tenantId';
const failure = () =>
  api(
    'Report sanitized failure',
    runPath('complete'),
    `{tenantId:${runTenant},errorCode:'GMAIL_EXECUTION_FAILED'}`,
  );

await save(
  2,
  '02-gmail-reconciliation-preview.json',
  '02 - Gmail - Reconciliation Preview',
  () => ({
    nodes: [
      ...manualBase('gmail-reconciliation-preview', 'fetching'),
      gmail('List ten unread messages', true),
      code(
        'Validate list and bound message IDs',
        "const r=$json;if(r.statusCode!==200)return [{json:{failed:true}}]; const ids=(r.body?.messages ?? []).slice(0,10).map(m=>m.id).filter(id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(id));return ids.length?ids.map(id=>({json:{messageId:id,failed:false,empty:false}})):[{json:{failed:false,empty:true}}];",
      ),
      branch('Gmail list failed?', '={{ $json.failed }}'),
      branch('No unread messages?', '={{ $json.empty }}'),
      api('Store empty preview', runPath('candidates'), `{tenantId:${runTenant},messages:[]}`),
      gmail('Retrieve preview message content'),
      code(
        'Aggregate transient preview batch',
        `const all=$input.all(); const failed=all.some(i=>i.json.statusCode!==200||!i.json.body?.id); return [{json:{tenantId:${runTenant},failed,messages:failed?[]:all.map(i=>i.json.body)}}];`,
      ),
      branch('Gmail retrieval failed?', '={{ $json.failed }}'),
      api(
        'Parse and store minimal preview',
        runPath('candidates'),
        '{tenantId:$json.tenantId,messages:$json.messages}',
      ),
      failure(),
    ],
    edges: [
      ...baseEdges,
      ['Report run progress', 'List ten unread messages'],
      ['List ten unread messages', 'Validate list and bound message IDs'],
      ['Validate list and bound message IDs', 'Gmail list failed?'],
      ['Gmail list failed?', 'Report sanitized failure'],
      ['Gmail list failed?', 'No unread messages?', 1],
      ['No unread messages?', 'Store empty preview'],
      ['No unread messages?', 'Retrieve preview message content', 1],
      ['Retrieve preview message content', 'Aggregate transient preview batch'],
      ['Aggregate transient preview batch', 'Gmail retrieval failed?'],
      ['Gmail retrieval failed?', 'Report sanitized failure'],
      ['Gmail retrieval failed?', 'Parse and store minimal preview', 1],
    ],
  }),
);

await save(
  3,
  '03-gmail-process-selected-messages.json',
  '03 - Gmail - Process Selected Messages',
  () => ({
    nodes: [
      ...manualBase('gmail-process-selected', 'processing'),
      code(
        'Only explicitly selected pending IDs',
        "const ids=$('Load authorized run context').first().json.messageIds ?? [];if(ids.length>10)throw new Error('SELECTION_LIMIT_EXCEEDED');return ids.length?ids.map(id=>({json:{messageId:id,empty:false}})):[{json:{empty:true}}];",
      ),
      branch('Selection already finished?', '={{ $json.empty }}'),
      gmail('Recheck selected Gmail message'),
      code(
        'Check every selected retrieval',
        `const all=$input.all();if(all.some(i=>i.json.statusCode!==200||!i.json.body?.id))return [{json:{failed:true}}];return all.map(i=>({json:{failed:false,tenantId:${runTenant},runId:$('Load authorized run context').first().json.run.id,mode:'selected',message:i.json.body}}));`,
      ),
      branch('Selected retrieval failed?', '={{ $json.failed }}'),
      { ...execute('Execute shared email router', 1), onError: 'continueErrorOutput' },
      code(
        'Sanitize batch completion',
        `return [{json:{tenantId:${runTenant},processed:$input.all().length,failed:$input.all().some(i=>i.json.failed===true)}}];`,
      ),
      branch('Any reconciliation failed?', '={{ $json.failed }}'),
      api('Complete selected run', runPath('complete'), `{tenantId:${runTenant}}`),
      failure(),
    ],
    edges: [
      ...baseEdges,
      ['Report run progress', 'Only explicitly selected pending IDs'],
      ['Only explicitly selected pending IDs', 'Selection already finished?'],
      ['Selection already finished?', 'Complete selected run'],
      ['Selection already finished?', 'Recheck selected Gmail message', 1],
      ['Recheck selected Gmail message', 'Check every selected retrieval'],
      ['Check every selected retrieval', 'Selected retrieval failed?'],
      ['Selected retrieval failed?', 'Report sanitized failure'],
      ['Selected retrieval failed?', 'Execute shared email router', 1],
      ['Execute shared email router', 'Sanitize batch completion'],
      ['Execute shared email router', 'Report sanitized failure', 1],
      ['Sanitize batch completion', 'Any reconciliation failed?'],
      ['Any reconciliation failed?', 'Report sanitized failure'],
      ['Any reconciliation failed?', 'Complete selected run', 1],
    ],
  }),
);

// All legacy auxiliary workflows inherit the same execution privacy policy.
for (const filename of [
  '05-local-email-fixture.json',
  '20-important-email-process.json',
  '90-review-queue.json',
  '98-system-connectivity-check.json',
  '99-error-handler.json',
]) {
  const path = resolve(directory, filename);
  const workflow = JSON.parse(await readFile(path, 'utf8'));
  workflow.settings = { ...workflow.settings, ...settings };
  if (filename === '99-error-handler.json') {
    delete workflow.settings.errorWorkflow;
    workflow.nodes.find((n) => n.name === 'Sanitize failure').parameters.jsCode =
      "const execution=$json.execution ?? {};return [{json:{schemaVersion:1,tenantId:$env.LOCAL_TENANT_ID,actionType:'n8n.workflow.error',idempotencyKey:'n8n-error:'+String(execution.id ?? $execution.id),status:'failed',input:{workflowId:String($json.workflow?.id ?? ''),executionId:String(execution.id ?? ''),errorCode:'WORKFLOW_EXECUTION_FAILED'}}}];";
    const persist = workflow.nodes.find((n) => n.name === 'Record sanitized action run');
    persist.parameters.headerParameters.parameters =
      persist.parameters.headerParameters.parameters.filter(
        (header) => header.name !== 'x-tenant-id',
      );
    persist.parameters.headerParameters.parameters.push({
      name: 'x-tenant-id',
      value: '={{ $env.LOCAL_TENANT_ID }}',
    });
  }
  await writeFile(path, `${JSON.stringify(workflow, null, 2)}\n`);
}
console.log(
  'Generated shared Gmail ingestion, preview, and selected-message workflows with no credential bindings.',
);
