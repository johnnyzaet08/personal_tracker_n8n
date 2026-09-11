import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  emailSyncPreviewRequestSchema,
  type FinancialTransactionCandidate,
} from '@tracker/contracts';
import {
  canonicalAmount,
  currentPeriod,
  financialIdentity,
  gmailQuery,
  inFinancialPeriod,
  localDate,
} from './email-sync.policy';

void test('current month uses Costa Rica local date across the UTC month boundary', () => {
  const now = new Date('2026-10-01T05:59:59Z');
  assert.equal(localDate(now), '2026-09-30');
  assert.equal(currentPeriod('current_month', undefined, now).month, '2026-09');
  assert.equal(
    currentPeriod('current_month', undefined, now).start.toISOString(),
    '2026-09-01T06:00:00.000Z',
  );
  assert.ok(inFinancialPeriod('2026-10-01T05:00:00Z', '2026-09', null, now));
  assert.equal(inFinancialPeriod('2026-10-01T06:00:00Z', '2026-09', null, now), false);
});

void test('exact date validation rejects outside month and invalid days', () => {
  const now = new Date('2026-09-04T12:00:00Z');
  assert.equal(currentPeriod('exact_date', '2026-09-01', now).exactDate, '2026-09-01');
  for (const date of ['2026-08-31', '2026-10-01', '2026-09-31'])
    assert.throws(() => currentPeriod('exact_date', date, now));
  assert.equal(
    emailSyncPreviewRequestSchema.safeParse({ period: 'current_month', exactDate: '2026-09-01' })
      .success,
    false,
  );
  assert.equal(emailSyncPreviewRequestSchema.safeParse({ period: 'exact_date' }).success, false);
  assert.equal(inFinancialPeriod('2026-09-03T17:00:00Z', '2026-09', '2026-09-04', now), false);
});

void test('Gmail search specifies exact sender, unread and Costa Rica month bounds', () => {
  const query = gmailQuery('alerts@bank.example', '2026-09');
  assert.ok(query.includes('from:(alerts@bank.example) is:unread'));
  assert.ok(query.includes(`after:${Date.parse('2026-09-01T06:00:00Z') / 1000 - 1}`));
  const exact = gmailQuery('alerts@bank.example', '2026-09', '2026-09-04');
  assert.ok(exact.includes(`after:${Date.parse('2026-09-04T06:00:00Z') / 1000 - 1}`));
  assert.ok(exact.includes(`before:${Date.parse('2026-09-05T06:00:00Z') / 1000}`));
  assert.throws(() => gmailQuery('alerts@bank.example', '2026-09', '2026-08-31'));
  assert.throws(() => gmailQuery('alerts@bank.example OR from:attacker@example.test', '2026-09'));
});

void test('financial identity uses decimal strings and stable reference, while changes alter comparison hash', () => {
  const source = {
    tenantId: '11111111-1111-4111-8111-111111111111',
    institutionName: 'Synthetic Bank',
    accountId: null,
  };
  const candidate: FinancialTransactionCandidate = {
    schemaVersion: 1,
    candidateId: source.tenantId,
    tenantId: source.tenantId,
    sourceEventId: source.tenantId,
    direction: 'debit',
    transactionType: 'purchase',
    amount: '9999999999999999.99',
    currency: 'CRC',
    description: ' Synthetic shop ',
    merchant: 'Synthetic shop',
    occurredAt: '2026-09-03T17:00:00Z',
    externalReference: 'SYNTH-12345',
    maskedIdentifier: '****4242',
    requiresReview: false,
    rawMetadata: {},
    adapter: { name: 'test', version: '1' },
  };
  assert.equal(canonicalAmount(candidate.amount), '9999999999999999.9900');
  const original = financialIdentity(source, candidate);
  const changed = financialIdentity(source, { ...candidate, amount: '9999999999999999.98' });
  assert.equal(original.reconciliationKey, changed.reconciliationKey);
  assert.notEqual(original.financialHash, changed.financialHash);
  const fallback = financialIdentity(source, { ...candidate, externalReference: undefined });
  assert.notEqual(original.reconciliationKey, fallback.reconciliationKey);
  assert.notEqual(
    fallback.reconciliationKey,
    financialIdentity(source, { ...candidate, externalReference: undefined, amount: '1.00' })
      .reconciliationKey,
  );
});
