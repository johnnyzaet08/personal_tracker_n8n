import { createHash } from 'node:crypto';
import type { EmailSyncRunResult, FinancialTransactionCandidate } from '@tracker/contracts';

export const EMAIL_TIMEZONE = 'America/Costa_Rica' as const;
export const ACTIVE_RUN_STATES = ['pending', 'fetching', 'awaiting_selection', 'processing'];
export const EMAIL_ADAPTERS = [
  { key: 'bank-purchase-html-v1', displayName: 'Bank purchase HTML', version: '1.0.0' },
];

export function localDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: EMAIL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function currentPeriod(period: string, exactDate?: string | null, now = new Date()) {
  const month = localDate(now).slice(0, 7);
  if (period !== 'current_month' && period !== 'exact_date') throw new Error('INVALID_PERIOD');
  if (
    period === 'exact_date' &&
    (!exactDate ||
      exactDate.slice(0, 7) !== month ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(exactDate) ||
      localDate(new Date(`${exactDate}T12:00:00-06:00`)) !== exactDate)
  ) {
    throw new Error('DATE_OUTSIDE_CURRENT_MONTH');
  }
  const [year, monthNumber] = month.split('-').map(Number);
  const start = new Date(`${month}-01T00:00:00-06:00`);
  const end = new Date(Date.UTC(year!, monthNumber, 1, 6));
  return { month, start, end, exactDate: period === 'exact_date' ? exactDate! : null };
}

export function inFinancialPeriod(
  occurredAt: string,
  month: string,
  exactDate?: string | null,
  now = new Date(),
): boolean {
  const date = new Date(occurredAt);
  if (!Number.isFinite(date.getTime())) return false;
  const local = localDate(date);
  return (
    month === localDate(now).slice(0, 7) &&
    local.slice(0, 7) === month &&
    (!exactDate || local === exactDate)
  );
}

export function gmailQuery(sender: string, month: string, exactDate?: string | null): string {
  // Configuration accepts a single normalized mailbox; quotes protect Gmail search operators.
  if (!/^[^\s"<>:]+@[^\s"<>:]+$/u.test(sender)) throw new Error('INVALID_SENDER');
  if (exactDate && exactDate.slice(0, 7) !== month) throw new Error('DATE_OUTSIDE_PERIOD');
  const start = new Date(`${exactDate ?? `${month}-01`}T00:00:00-06:00`);
  const [year, m] = month.split('-').map(Number);
  const end = exactDate
    ? new Date(start.getTime() + 86_400_000)
    : new Date(Date.UTC(year!, m, 1, 6));
  return `from:(${sender}) is:unread after:${Math.floor(start.getTime() / 1000) - 1} before:${Math.floor(end.getTime() / 1000)}`;
}

export function canonicalText(value: string | undefined | null): string {
  return (value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

export function canonicalAmount(value: string): string {
  const [whole, fraction = ''] = value.split('.');
  return `${BigInt(whole!).toString()}.${fraction.padEnd(4, '0')}`;
}

export function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function financialIdentity(
  source: { tenantId: string; institutionName: string; accountId: string | null },
  candidate: FinancialTransactionCandidate,
) {
  const scope = [
    source.tenantId,
    canonicalText(source.institutionName),
    source.accountId ?? canonicalText(candidate.maskedIdentifier),
  ];
  const values = [
    candidate.direction,
    canonicalText(candidate.transactionType),
    canonicalAmount(candidate.amount),
    candidate.currency,
    new Date(candidate.occurredAt).toISOString(),
    canonicalText(candidate.merchant),
    canonicalText(candidate.description),
    canonicalText(candidate.externalReference),
    canonicalText(candidate.maskedIdentifier),
  ];
  const reconciliationKey = digest(
    candidate.externalReference
      ? [...scope, 'reference', canonicalText(candidate.externalReference)]
      : [
          ...scope,
          'fallback',
          candidate.direction,
          new Date(candidate.occurredAt).toISOString(),
          canonicalAmount(candidate.amount),
          candidate.currency,
          canonicalText(candidate.merchant),
        ],
  );
  return { reconciliationKey, financialHash: digest([...scope, ...values]) };
}

export function emptyRunResult(): EmailSyncRunResult {
  return {
    found: 0,
    eligible: 0,
    selected: 0,
    new: 0,
    duplicates: 0,
    inReview: 0,
    ignoredOutsidePeriod: 0,
    invalid: 0,
    updated: 0,
    errors: [],
  };
}
