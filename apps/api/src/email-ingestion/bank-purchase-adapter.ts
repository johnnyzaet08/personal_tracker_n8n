import { createHash, randomUUID } from 'node:crypto';
import type {
  BankEmailAdapterResult,
  EmailSourceEvent,
  FinancialTransactionCandidate,
} from '@tracker/contracts';
import { normalizeGmailMessage, type HeaderBag, type NormalizedEmail } from './mime-parser';

export { extractGmailSender, normalizeGmailMessage, parseMime } from './mime-parser';
export const BANK_PURCHASE_ADAPTER = { name: 'bank-purchase-html-v1', version: '1.0.0' } as const;
export type AuthenticationStatus = 'pass' | 'fail' | 'missing';
export interface EmailAuthentication {
  spf: AuthenticationStatus;
  dkim: AuthenticationStatus;
  dmarc: AuthenticationStatus;
}
export interface ParserContext {
  tenantId: string;
  sourceEventId?: string;
  adapterKey: string;
  defaultCurrency?: string | null;
  accountId?: string | null;
}

/** Gmail's top Authentication-Results is authoritative; caller-supplied DKIM signatures are not proof. */
export function inspectAuthentication(headers: HeaderBag): EmailAuthentication {
  const results = headers['authentication-results'] ?? [];
  const trusted = results.find((value) => /^\s*mx\.google\.com\s*;/iu.test(value));
  const status = (method: string): AuthenticationStatus => {
    if (!trusted) return 'missing';
    const values = [...trusted.matchAll(new RegExp(`(?:^|[;\\s])${method}=([a-z]+)`, 'giu'))].map(
      (match) => match[1]?.toLowerCase(),
    );
    if (!values.length) return 'missing';
    if (values.some((value) => value !== 'pass')) return 'fail';
    return 'pass';
  };
  return { spf: status('spf'), dkim: status('dkim'), dmarc: status('dmarc') };
}

function decodeEntities(value: string): string {
  const entities: Record<string, string> = {
    nbsp: ' ',
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    aacute: 'á',
    eacute: 'é',
    iacute: 'í',
    oacute: 'ó',
    uacute: 'ú',
    ntilde: 'ñ',
    Aacute: 'Á',
    Eacute: 'É',
    Iacute: 'Í',
    Oacute: 'Ó',
    Uacute: 'Ú',
    Ntilde: 'Ñ',
    col: '₡',
    cent: '¢',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (whole: string, entity: string) => {
    if (!entity.startsWith('#')) return entities[entity] ?? whole;
    const numeric =
      entity.startsWith('#x') || entity.startsWith('#X')
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
    return numeric > 0 && numeric <= 0x10ffff && !(numeric >= 0xd800 && numeric <= 0xdfff)
      ? String.fromCodePoint(numeric)
      : '';
  });
}

/** Converts template labels/cells only; HTML is never rendered and external content is never fetched. */
export function htmlTokens(html: string): string[] {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/gu, '')
      .replace(/<(script|style|head|svg|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, '')
      .replace(/<(?:br|\/td|\/th|\/tr|\/p|\/div|\/h[1-6])\b[^>]*>/giu, '\n')
      .replace(/<[^>]*>/gu, ''),
  )
    .split(/\n/u)
    .map((token) => token.replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
}

const normalized = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
const labels: Record<string, string> = {
  comercio: 'merchant',
  fecha: 'date',
  tarjeta: 'card',
  'numero de tarjeta': 'card',
  referencia: 'reference',
  'tipo de transaccion': 'type',
  monto: 'amount',
};

function templateFields(tokens: string[]): { fields: Record<string, string>; ambiguous: boolean } {
  const fields: Record<string, string> = {};
  let ambiguous = false;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? '';
    const colon = token.indexOf(':');
    if (colon < 0) continue;
    const key = labels[normalized(token.slice(0, colon).trim())];
    if (!key) continue;
    const next = tokens[i + 1] ?? '';
    const nextColon = next.indexOf(':');
    const nextIsLabel =
      nextColon >= 0 && labels[normalized(next.slice(0, nextColon).trim())] !== undefined;
    const value = token.slice(colon + 1).trim() || (nextIsLabel ? '' : next);
    if (fields[key] !== undefined) ambiguous = true;
    fields[key] = value.slice(0, 1000);
  }
  return { fields, ambiguous };
}

export function parseDecimalAmount(value: string): { amount?: string; currency?: string } {
  const codes = [...new Set(value.match(/\b(?:CRC|USD|EUR)\b/gu) ?? [])];
  const symbols = [
    /(?:₡|¢)/u.test(value) ? 'CRC' : undefined,
    /US\$/u.test(value) ? 'USD' : undefined,
    /€/u.test(value) ? 'EUR' : undefined,
  ].filter((code): code is string => Boolean(code));
  const currencies = [...new Set([...codes, ...symbols])];
  if (currencies.length > 1) return {};
  const currency = currencies[0];
  const number = value.replace(/\b(?:CRC|USD|EUR)\b|US\$|[₡¢$€\s]/gu, '');
  if (/^\d{1,3}[.,]\d{3}$/u.test(number)) return { currency };
  let amount: string;
  if (/^\d{1,3}(?:,\d{3})+\.\d{2,4}$/u.test(number) || /^\d{1,16}\.\d{2,4}$/u.test(number)) {
    amount = number.replace(/,/gu, '');
  } else if (/^\d{1,3}(?:\.\d{3})+,\d{2,4}$/u.test(number) || /^\d{1,16},\d{2,4}$/u.test(number)) {
    amount = number.replace(/\./gu, '').replace(',', '.');
  } else if (/^\d{1,16}$/u.test(number)) amount = `${number}.00`;
  else return { currency };
  const [integer = '', fraction = ''] = amount.split('.');
  const clean = integer.replace(/^0+(?=\d)/u, '');
  if (clean.length > 16 || BigInt(clean + fraction.padEnd(4, '0')) === 0n) return { currency };
  return { amount: `${clean}.${fraction.padEnd(2, '0')}`, currency };
}

export function parseBankDate(value: string): string | undefined {
  const months: Record<string, number> = {
    jan: 1,
    ene: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    abr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    ago: 8,
    sep: 9,
    set: 9,
    oct: 10,
    nov: 11,
    dec: 12,
    dic: 12,
  };
  const monthFirst =
    /^([a-z]{3})\.?\s+(\d{1,2}),?\s+(\d{4})\s*,?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/iu.exec(value);
  const numeric = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s*,?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/u.exec(
    value,
  );
  const match = monthFirst ?? numeric;
  if (!match) return undefined;
  const month = monthFirst ? months[normalized(match[1] ?? '')] : Number(match[2]);
  const day = Number(monthFirst ? match[2] : match[1]);
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  if (
    !month ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    year < 2000 ||
    year > 2200 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    return undefined;
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day) return undefined;
  // Costa Rica has a fixed UTC-06:00 offset with no daylight saving time.
  return new Date(local.getTime() + 6 * 60 * 60 * 1000).toISOString();
}

/** Institution template adapter only: it consumes normalized email, never the Gmail node shape. */
export function adaptBankPurchase(
  email: NormalizedEmail,
  context: ParserContext,
  sourceEventId: string,
): BankEmailAdapterResult {
  const reasonCodes: string[] = [];
  const adapter = { ...BANK_PURCHASE_ADAPTER };
  if (context.adapterKey !== adapter.name) {
    return {
      schemaVersion: 1,
      adapter,
      requiresReview: true,
      reasonCodes: ['UNSUPPORTED_ADAPTER'],
    };
  }
  if (!email.html)
    return { schemaVersion: 1, adapter, requiresReview: true, reasonCodes: ['HTML_BODY_MISSING'] };
  const tokens = htmlTokens(email.html);
  const { fields, ambiguous } = templateFields(tokens);
  if (ambiguous) reasonCodes.push('AMBIGUOUS_TEMPLATE');
  const monetary = parseDecimalAmount(fields.amount ?? '');
  const currency = monetary.currency ?? context.defaultCurrency ?? undefined;
  const occurredAt = parseBankDate(fields.date ?? '');
  const merchant = fields.merchant?.trim().slice(0, 255);
  const reference = fields.reference?.replace(/\s+/gu, '');
  const transactionType = normalized(fields.type ?? '');
  if (!monetary.amount) reasonCodes.push('AMOUNT_MISSING_OR_INVALID');
  if (!currency || !/^[A-Z]{3}$/u.test(currency)) reasonCodes.push('CURRENCY_MISSING_OR_AMBIGUOUS');
  if (!occurredAt) reasonCodes.push('FINANCIAL_DATE_MISSING_OR_INVALID');
  if (!merchant) reasonCodes.push('MERCHANT_MISSING');
  if (!reference || !/^[A-Za-z0-9_-]{6,64}$/u.test(reference))
    reasonCodes.push('REFERENCE_MISSING_OR_INVALID');
  if (transactionType !== 'compra' && transactionType !== 'purchase')
    reasonCodes.push('UNSUPPORTED_TRANSACTION_TYPE');
  const masked = (fields.card ?? tokens.join(' '))
    .match(/[Xx*•]{4,}[ -]*\d{4}\b/u)?.[0]
    ?.replace(/[ -]/gu, '');
  const maskedIdentifier = masked ? `****${masked.slice(-4)}` : undefined;
  if (
    reasonCodes.length ||
    !monetary.amount ||
    !currency ||
    !occurredAt ||
    !merchant ||
    !reference
  ) {
    return { schemaVersion: 1, adapter, requiresReview: true, reasonCodes };
  }
  const auth = inspectAuthentication(email.headers);
  for (const [method, status] of Object.entries(auth)) {
    if (status !== 'pass')
      reasonCodes.push(`${method.toUpperCase()}_${status === 'missing' ? 'MISSING' : 'FAILED'}`);
  }
  const candidate: FinancialTransactionCandidate = {
    schemaVersion: 1,
    candidateId: randomUUID(),
    tenantId: context.tenantId,
    sourceEventId,
    externalReference: reference,
    ...(context.accountId ? { accountId: context.accountId } : {}),
    direction: 'debit',
    transactionType: 'purchase',
    amount: monetary.amount,
    currency,
    description: merchant,
    merchant,
    ...(maskedIdentifier ? { maskedIdentifier } : {}),
    occurredAt,
    confidence: reasonCodes.length ? 0.5 : 0.99,
    requiresReview: reasonCodes.length > 0,
    rawMetadata: {},
    adapter,
  };
  return {
    schemaVersion: 1,
    adapter,
    candidate,
    requiresReview: reasonCodes.length > 0,
    reasonCodes,
  };
}

export function parseGmailMessage(
  message: unknown,
  context: ParserContext,
): {
  event: EmailSourceEvent;
  adapterResult: BankEmailAdapterResult;
  authentication: EmailAuthentication;
  contentHash: string;
} {
  const email = normalizeGmailMessage(message);
  const sourceEventId = context.sourceEventId ?? randomUUID();
  const authentication = inspectAuthentication(email.headers);
  const adapterResult = adaptBankPurchase(email, context, sourceEventId);
  const c = adapterResult.candidate;
  // Ordered fixed keys exclude transport headers, dates, adapter version and generated identifiers.
  const canonical = {
    sender: email.sender,
    direction: c?.direction ?? null,
    transactionType: c?.transactionType ?? null,
    amount: c ? c.amount.replace(/(\.\d*?)0+$/u, '$1').replace(/\.$/u, '') : null,
    currency: c?.currency ?? null,
    occurredAt: c?.occurredAt ?? null,
    merchant: c?.merchant?.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase() ?? null,
    externalReference: c?.externalReference ?? null,
    maskedIdentifier: c?.maskedIdentifier ?? null,
  };
  // An invalid template hashes only recognized financial fields; never store or hash transport headers.
  const relevant = c
    ? canonical
    : { ...canonical, recognized: templateFields(htmlTokens(email.html ?? '')).fields };
  return {
    event: {
      schemaVersion: 1,
      eventId: sourceEventId,
      tenantId: context.tenantId,
      source: 'gmail',
      externalId: email.messageId,
      occurredAt: email.receivedAt,
      receivedAt: email.receivedAt,
      sender: { address: email.sender },
      labels: email.labels,
      attachments: [],
      metadata: {
        ...(email.threadId ? { gmailThreadId: email.threadId } : {}),
        connector: 'gmail',
        authentication,
      },
    },
    adapterResult,
    authentication,
    contentHash: createHash('sha256').update(JSON.stringify(relevant)).digest('hex'),
  };
}
