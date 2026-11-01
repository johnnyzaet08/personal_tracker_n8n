import { createHash } from 'node:crypto';
import type { EmailSyncRunResult, FinancialTransactionCandidate } from '@tracker/contracts';

export const EMAIL_TIMEZONE = 'America/Costa_Rica' as const;
export const ACTIVE_RUN_STATES = ['pending', 'fetching', 'awaiting_selection', 'processing'];
export const EXECUTING_RUN_STATES = ['pending', 'fetching', 'processing'];
export const EMAIL_RUN_TIMEOUT_MS = 3 * 60_000;
export const EMAIL_SELECTION_TTL_MS = 30 * 60_000;
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

export function availableMonths(now = new Date()): string[] {
  const [year, month] = localDate(now).slice(0, 7).split('-').map(Number);
  return [0, 1, 2].map((offset) => {
    const date = new Date(Date.UTC(year!, month! - 1 - offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

function isLocalDate(value: string | undefined): value is string {
  return Boolean(
    value &&
      /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
      localDate(new Date(`${value}T12:00:00-06:00`)) === value,
  );
}

function nextLocalDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + 1)).toISOString().slice(0, 10);
}

function localMidnight(value: string): Date {
  return new Date(`${value}T00:00:00-06:00`);
}

export type RequestedPeriod = {
  periodMonth?: string;
  startDate?: string;
  endDate?: string;
  exactDate?: string | null;
};

export function currentPeriod(period: string, requested: RequestedPeriod = {}, now = new Date()) {
  const currentMonth = localDate(now).slice(0, 7);
  if (period !== 'current_month' && period !== 'exact_date') throw new Error('INVALID_PERIOD');
  if (period === 'current_month') {
    const month = requested.periodMonth ?? currentMonth;
    if (!availableMonths(now).includes(month)) throw new Error('MONTH_OUTSIDE_ALLOWED_WINDOW');
    const year = Number(month.slice(0, 4));
    const monthNumber = Number(month.slice(5, 7));
    const startDate = `${month}-01`;
    const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
    const endDate = month === currentMonth ? localDate(now) : monthEnd;
    return {
      month,
      start: localMidnight(startDate),
      end: localMidnight(nextLocalDate(endDate)),
      exactDate: null,
      startDate,
      endDate,
    };
  }

  const startDate = requested.startDate ?? requested.exactDate ?? undefined;
  const endDate = requested.endDate ?? requested.exactDate ?? undefined;
  const minimumDate = `${availableMonths(now)[2]}-01`;
  const maximumDate = localDate(now);
  if (
    !isLocalDate(startDate) ||
    !isLocalDate(endDate) ||
    startDate < minimumDate ||
    endDate > maximumDate ||
    startDate > endDate
  )
    throw new Error('DATE_OUTSIDE_ALLOWED_WINDOW');
  return {
    month: startDate.slice(0, 7),
    start: localMidnight(startDate),
    end: localMidnight(nextLocalDate(endDate)),
    exactDate: startDate === endDate ? startDate : null,
    startDate,
    endDate,
  };
}

export function inFinancialPeriod(occurredAt: string, startDate: string, endDate: string): boolean {
  const date = new Date(occurredAt);
  if (!Number.isFinite(date.getTime())) return false;
  const local = localDate(date);
  return local >= startDate && local <= endDate;
}

export function gmailQuery(sender: string, startDate: string, endDate: string): string {
  // Configuration accepts a single normalized mailbox; quotes protect Gmail search operators.
  if (!/^[^\s"<>:]+@[^\s"<>:]+$/u.test(sender)) throw new Error('INVALID_SENDER');
  if (!isLocalDate(startDate) || !isLocalDate(endDate) || startDate > endDate)
    throw new Error('INVALID_DATE_RANGE');
  const start = localMidnight(startDate);
  const end = localMidnight(nextLocalDate(endDate));
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
