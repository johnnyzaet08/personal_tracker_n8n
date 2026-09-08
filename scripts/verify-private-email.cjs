// Local-only verification. Outputs counts/booleans; never prints private values.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const {
  parseGmailMessage,
  parseMime,
} = require('../apps/api/dist/email-ingestion/bank-purchase-adapter.js');
function samples(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? samples(file) : entry.name.endsWith('.eml') ? [file] : [];
  });
}
try {
  const source = JSON.parse(
    fs.readFileSync(path.join(root, '.private/gmail-source-config.json'), 'utf8'),
  );
  const files = samples(path.join(root, '.private'));
  let passed = 0;
  for (const file of files) {
    const raw = fs.readFileSync(file);
    const mime = parseMime(raw);
    const result = parseGmailMessage(
      { id: 'local-private-parser-check', raw: raw.toString('base64url'), labelIds: ['UNREAD'] },
      {
        tenantId: '11111111-1111-4111-8111-111111111111',
        adapterKey: source.adapterKey,
        defaultCurrency: source.defaultCurrency,
      },
    );
    const candidate = result.adapterResult.candidate;
    const checks = [
      !!mime.html,
      mime.text === undefined,
      result.event.sender.address === source.senderAddress,
      !!candidate?.amount,
      !!candidate?.currency,
      !!candidate?.occurredAt,
      !!candidate?.merchant,
      !!candidate?.maskedIdentifier,
      !!candidate?.externalReference,
      result.adapterResult.requiresReview === false,
      result.event.htmlBody === undefined &&
        result.event.textBody === undefined &&
        result.event.attachments.length === 0,
    ];
    if (checks.every(Boolean)) passed += 1;
  }
  console.log(
    JSON.stringify({
      privateSamples: files.length,
      passed,
      checksPerSample: 11,
      privateValuesLogged: false,
    }),
  );
  if (!files.length || passed !== files.length) process.exitCode = 1;
} catch {
  console.error('PRIVATE_PARSER_VERIFICATION_FAILED');
  process.exitCode = 1;
}
