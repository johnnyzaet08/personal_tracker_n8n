import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import {
  parseBankDate,
  parseDecimalAmount,
  parseGmailMessage,
  parseMime,
  inspectAuthentication,
} from './bank-purchase-adapter';
import { extractGmailSender, normalizeGmailMessage, normalizeSender } from './mime-parser';

const fixture = readFileSync(
  resolve(process.cwd(), 'apps/api/src/email-ingestion/fixtures/synthetic-purchase.eml'),
);
const context = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  adapterKey: 'bank-purchase-html-v1',
};
const message = (raw: Buffer | string = fixture, id = 'synthetic-gmail-001') => ({
  id,
  threadId: 'synthetic-thread-001',
  labelIds: ['UNREAD', 'INBOX'],
  internalDate: '1788455700000',
  raw: Buffer.from(raw).toString('base64url'),
});

void test('HTML-only multipart related decodes safely and ignores inline image', () => {
  const mime = parseMime(fixture);
  assert.equal(mime.text, undefined);
  assert.ok(mime.html?.includes('TIENDA SINTÉTICA'));
  assert.ok(!mime.html?.includes('/9j/2Q=='));
  const result = parseGmailMessage(message(), context);
  const c = result.adapterResult.candidate;
  assert.equal(c?.amount, '1234.50');
  assert.equal(c?.currency, 'CRC');
  assert.equal(c?.occurredAt, '2026-09-03T17:15:00.000Z');
  assert.equal(c?.merchant, 'TIENDA SINTÉTICA');
  assert.equal(c?.maskedIdentifier, '****4242');
  assert.equal(c?.externalReference, '777888999000');
  assert.equal(c?.transactionType, 'purchase');
  assert.equal(result.adapterResult.requiresReview, false);
  assert.equal(result.event.sender.address, 'alerts@bank.example');
  assert.equal(result.event.htmlBody, undefined);
  assert.equal(result.event.textBody, undefined);
  assert.deepEqual(result.event.attachments, []);
});

void test('Gmail full payload and parsed n8n shapes use the same institution adapter', () => {
  const mime = parseMime(fixture);
  const original = message();
  const full = {
    id: original.id,
    internalDate: original.internalDate,
    labelIds: original.labelIds,
    payload: {
      mimeType: 'multipart/related',
      headers: Object.entries(mime.headers).flatMap(([name, values]) =>
        values.map((value) => ({ name, value })),
      ),
      parts: [
        {
          mimeType: 'text/html',
          headers: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
          body: { data: Buffer.from(mime.html ?? '').toString('base64url') },
        },
        {
          mimeType: 'image/jpeg',
          filename: 'ignored.jpg',
          body: { attachmentId: 'never-download' },
        },
      ],
    },
  };
  const parsed = {
    id: original.id,
    internalDate: original.internalDate,
    headers: Object.fromEntries(Object.entries(mime.headers).map(([k, v]) => [k, v[0]])),
    html: mime.html,
  };
  assert.equal(
    parseGmailMessage(full, context).contentHash,
    parseGmailMessage(message(), context).contentHash,
  );
  assert.equal(
    parseGmailMessage(parsed, context).contentHash,
    parseGmailMessage(message(), context).contentHash,
  );
  assert.equal(extractGmailSender(full), 'alerts@bank.example');
});

void test('exact sender normalization rejects multiple mailboxes and partial sender matches', () => {
  assert.equal(normalizeSender('Bank <ALERTS@BANK.EXAMPLE>'), 'alerts@bank.example');
  assert.equal(normalizeSender('alerts@bank.example,attacker@example.test'), '');
  assert.notEqual(normalizeSender('alerts@bank.example.attacker.test'), 'alerts@bank.example');
  assert.equal(
    normalizeSender({ value: [{ address: 'alerts@bank.example' }] }),
    'alerts@bank.example',
  );
});

void test('SPF and DKIM failures or missing authentication require human review', () => {
  for (const method of ['spf', 'dkim', 'dmarc']) {
    const raw = fixture.toString().replace(`${method}=pass`, `${method}=fail`);
    const result = parseGmailMessage(message(raw), context);
    assert.ok(result.adapterResult.requiresReview);
    assert.ok(result.adapterResult.reasonCodes.includes(`${method.toUpperCase()}_FAILED`));
  }
  assert.deepEqual(inspectAuthentication({ 'dkim-signature': ['unverified'] }), {
    spf: 'missing',
    dkim: 'missing',
    dmarc: 'missing',
  });
  const absent = fixture
    .toString()
    .replace(/Authentication-Results:[\s\S]*?Received-SPF:/u, 'Received-SPF:');
  assert.ok(
    parseGmailMessage(message(absent), context).adapterResult.reasonCodes.includes('SPF_MISSING'),
  );
});

void test('decimal money never uses floating-point and ambiguous separators are rejected', () => {
  assert.deepEqual(parseDecimalAmount('USD 9,876.54'), { amount: '9876.54', currency: 'USD' });
  assert.deepEqual(parseDecimalAmount('CRC 9.876,54'), { amount: '9876.54', currency: 'CRC' });
  assert.equal(parseDecimalAmount('CRC 9999999999999999.99').amount, '9999999999999999.99');
  assert.equal(parseDecimalAmount('CRC 1,234').amount, undefined);
  assert.equal(parseDecimalAmount('CRC -2.00').amount, undefined);
  assert.equal(parseDecimalAmount('CRC 0.00').amount, undefined);
  assert.equal(parseDecimalAmount('CRC USD 12.00').amount, undefined);
  assert.deepEqual(parseDecimalAmount('€ 100.00'), { amount: '100.00', currency: 'EUR' });
  assert.equal(parseDecimalAmount('USD € 100.00').amount, undefined);
});

void test('date parsing validates calendar and interprets template time in Costa Rica', () => {
  assert.equal(parseBankDate('Sep 3, 2026 , 11:15'), '2026-09-03T17:15:00.000Z');
  assert.equal(parseBankDate('03/09/2026 23:30'), '2026-09-04T05:30:00.000Z');
  assert.equal(parseBankDate('Feb 30, 2026 , 11:15'), undefined);
  assert.equal(parseBankDate('Sep 3, 2026 , 25:15'), undefined);
});

void test('missing amount, currency, date or stable reference never invents a transaction', () => {
  for (const field of ['CRC 1,234.50', 'Sep 3, 2026 , 11:15', '777888999000']) {
    assert.equal(
      parseGmailMessage(message(fixture.toString().replace(field, '')), context).adapterResult
        .candidate,
      undefined,
    );
  }
  const noCurrency = message(fixture.toString().replace('CRC 1,234.50', '1,234.50'));
  assert.equal(parseGmailMessage(noCurrency, context).adapterResult.candidate, undefined);
  assert.equal(
    parseGmailMessage(noCurrency, { ...context, defaultCurrency: 'CRC' }).adapterResult.candidate
      ?.currency,
    'CRC',
  );
});

void test('multiple purchases are ambiguous and do not silently extract the first', () => {
  const raw = fixture
    .toString()
    .replace('</tbody>', '<tr><td>Monto:</td><td>CRC 2,345.60</td></tr></tbody>');
  assert.ok(
    parseGmailMessage(message(raw), context).adapterResult.reasonCodes.includes(
      'AMBIGUOUS_TEMPLATE',
    ),
  );
  assert.equal(parseGmailMessage(message(raw), context).adapterResult.candidate, undefined);
});

void test('a blank field cannot use the next label as its financial value', () => {
  const raw = fixture.toString().replace('TIENDA SINT=C3=89TICA', '');
  const result = parseGmailMessage(message(raw), context);
  assert.equal(result.adapterResult.candidate, undefined);
  assert.ok(result.adapterResult.reasonCodes.includes('MERCHANT_MISSING'));
});

void test('canonical hash is independent of message ID and transport headers, detects financial changes', () => {
  const a = parseGmailMessage(message(), context);
  const b = parseGmailMessage(
    message(
      fixture.toString().replace('Date: Thu', 'X-Transport: changed\nDate: Thu'),
      'synthetic-gmail-002',
    ),
    context,
  );
  const c = parseGmailMessage(message(fixture.toString().replace('1,234.50', '1,234.51')), context);
  assert.equal(a.contentHash, b.contentHash);
  assert.notEqual(a.event.externalId, b.event.externalId);
  assert.notEqual(a.contentHash, c.contentHash);
});

void test('invalid inputs yield constant errors and do not expose provider content', () => {
  assert.throws(
    () => normalizeGmailMessage({ raw: 'secret-not-printed' }),
    /^Error: GMAIL_MESSAGE_ID_REQUIRED$/u,
  );
  assert.throws(() => parseMime(Buffer.alloc(2_000_001)), /^Error: EMAIL_TOO_LARGE$/u);
  const result = JSON.stringify(parseGmailMessage(message(), context));
  for (const forbidden of [
    '<html>',
    'DKIM-Signature',
    'customer@example.test',
    'NOT-A-SIGNATURE',
    'synthetic-logo',
  ]) {
    assert.ok(!result.includes(forbidden));
  }
});
