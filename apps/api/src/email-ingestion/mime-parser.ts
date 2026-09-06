/** Bounded connector parser. Nothing in this module writes data, loads URLs, or logs content. */
export type HeaderBag = Record<string, string[]>;
export interface NormalizedEmail {
  messageId: string;
  threadId?: string;
  receivedAt: string;
  sender: string;
  headers: HeaderBag;
  html?: string;
  text?: string;
  labels: string[];
}

const MAX_BYTES = 2_000_000;
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function bounded(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (Buffer.byteLength(value) > MAX_BYTES) throw new Error('EMAIL_TOO_LARGE');
  return value;
}

function addHeader(headers: HeaderBag, name: string, value: string): void {
  const key = name.trim().toLowerCase();
  if (!/^[a-z0-9-]{1,100}$/u.test(key) || value.length > 32_768) return;
  (headers[key] ??= []).push(value.replace(/\r?\n[ \t]+/gu, ' '));
}

export function readHeaders(value: unknown): HeaderBag {
  const headers: HeaderBag = {};
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 200)) {
      const pair = record(entry);
      if (typeof pair.name === 'string' && typeof pair.value === 'string') {
        addHeader(headers, pair.name, pair.value);
      }
    }
  } else {
    for (const [key, entry] of Object.entries(record(value)).slice(0, 200)) {
      for (const v of Array.isArray(entry) ? entry : [entry]) {
        if (typeof v === 'string') addHeader(headers, key, v);
      }
    }
  }
  return headers;
}

function splitEntity(raw: string): { headers: HeaderBag; body: string } {
  const separator = /\r?\n\r?\n/u.exec(raw);
  if (!separator || separator.index > 128_000) throw new Error('INVALID_MIME');
  const headers: HeaderBag = {};
  const unfolded = raw.slice(0, separator.index).replace(/\r?\n[ \t]+/gu, ' ');
  for (const line of unfolded.split(/\r?\n/u).slice(0, 200)) {
    const colon = line.indexOf(':');
    if (colon > 0) addHeader(headers, line.slice(0, colon), line.slice(colon + 1).trim());
  }
  return { headers, body: raw.slice(separator.index + separator[0].length) };
}

function decodeText(body: string, headers: HeaderBag): string {
  const encoding = headers['content-transfer-encoding']?.[0]?.toLowerCase();
  let bytes: Buffer;
  if (encoding === 'base64') bytes = Buffer.from(body.replace(/\s/gu, ''), 'base64');
  else if (encoding === 'quoted-printable') {
    const text = body.replace(/=\r?\n/gu, '');
    const octets: number[] = [];
    for (let i = 0; i < text.length; i += 1) {
      const hex = text.slice(i + 1, i + 3);
      if (text[i] === '=' && /^[0-9a-f]{2}$/iu.test(hex)) {
        octets.push(Number.parseInt(hex, 16));
        i += 2;
      } else octets.push(text.charCodeAt(i) & 255);
    }
    bytes = Buffer.from(octets);
  } else bytes = Buffer.from(body, 'latin1');
  const charset = /charset\s*=\s*"?([^;"\s]+)/iu.exec(headers['content-type']?.[0] ?? '')?.[1];
  try {
    return new TextDecoder(charset ?? 'utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('UNSUPPORTED_EMAIL_ENCODING');
  }
}

/** Only text MIME leaves are decoded. Related images, attachments and nested messages are ignored. */
export function parseMime(raw: Buffer | string): {
  headers: HeaderBag;
  html?: string;
  text?: string;
} {
  const buffer = typeof raw === 'string' ? Buffer.from(raw, 'utf8') : raw;
  if (buffer.length > MAX_BYTES) throw new Error('EMAIL_TOO_LARGE');
  const root = splitEntity(buffer.toString('latin1'));
  const result: { headers: HeaderBag; html?: string; text?: string } = { headers: root.headers };
  let count = 0;
  function visit(entity: { headers: HeaderBag; body: string }, depth: number): void {
    if (depth > 12 || ++count > 100) throw new Error('MIME_COMPLEXITY_LIMIT');
    const type = entity.headers['content-type']?.[0] ?? 'text/plain';
    if (/^attachment\b/iu.test(entity.headers['content-disposition']?.[0] ?? '')) return;
    if (/^multipart\//iu.test(type)) {
      const boundary = /boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/iu.exec(type);
      const token = boundary?.[1] ?? boundary?.[2];
      if (!token || token.length > 200) throw new Error('INVALID_MIME_BOUNDARY');
      const lines = entity.body.split(/\r?\n/u);
      let part: string[] | undefined;
      for (const line of lines) {
        if (line.trimEnd() === `--${token}` || line.trimEnd() === `--${token}--`) {
          if (part) visit(splitEntity(part.join('\r\n')), depth + 1);
          part = line.trimEnd().endsWith('--') ? undefined : [];
        } else if (part) part.push(line);
      }
      return;
    }
    if (/^text\/(html|plain)(?:;|$)/iu.test(type)) {
      const key = /^text\/html/iu.test(type) ? 'html' : 'text';
      const text = decodeText(entity.body, entity.headers);
      result[key] = result[key] ? `${result[key]}\n${text}` : text;
    }
  }
  visit(root, 0);
  return result;
}

export function normalizeSender(value: unknown): string {
  if (typeof value !== 'string') {
    const object = record(value);
    if (Array.isArray(object.value) && object.value.length === 1) {
      return normalizeSender(record(object.value[0]).address);
    }
    return normalizeSender(object.address ?? object.text ?? '');
  }
  const input = value.trim();
  const bracket = /^(?:[^<>]*)<([^<>]+)>$/u.exec(input);
  const address = (bracket?.[1] ?? input).trim().toLowerCase();
  // One exact mailbox only: display names and partial-domain matches never authorize a source.
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/u.test(
    address,
  ) && address.length <= 320
    ? address
    : '';
}

export function extractGmailSender(message: unknown): string {
  const object = record(message);
  const payload = record(object.payload);
  const headers = readHeaders(payload.headers ?? object.headers);
  const values = headers.from;
  if (values && values.length !== 1) return '';
  if (values?.[0]) return normalizeSender(values[0]);
  if (typeof object.raw === 'string') {
    const raw = bounded(object.raw);
    return normalizeSender(parseMime(Buffer.from(raw ?? '', 'base64url')).headers.from?.[0]);
  }
  return normalizeSender(object.from ?? object.From);
}

export function normalizeGmailMessage(message: unknown): NormalizedEmail {
  const object = record(message);
  if (typeof object.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/u.test(object.id)) {
    throw new Error('GMAIL_MESSAGE_ID_REQUIRED');
  }
  const payload = record(object.payload);
  let headers = readHeaders(payload.headers ?? object.headers);
  let html = bounded(object.html);
  let text = bounded(object.text);
  if (typeof object.raw === 'string') {
    if (object.raw.length > Math.ceil((MAX_BYTES * 4) / 3) + 4) throw new Error('EMAIL_TOO_LARGE');
    const parsed = parseMime(Buffer.from(object.raw, 'base64url'));
    headers = parsed.headers;
    html = parsed.html;
    text = parsed.text;
  } else if (typeof payload.mimeType === 'string') {
    let count = 0;
    const visit = (part: Record<string, unknown>, depth: number): void => {
      if (depth > 12 || ++count > 100) throw new Error('MIME_COMPLEXITY_LIMIT');
      const type = part.mimeType;
      const partHeaders = readHeaders(part.headers);
      if (part.filename || /^attachment/iu.test(partHeaders['content-disposition']?.[0] ?? ''))
        return;
      if (Array.isArray(part.parts)) {
        for (const child of part.parts) visit(record(child), depth + 1);
      }
      const data = record(part.body).data;
      if ((type === 'text/html' || type === 'text/plain') && typeof data === 'string') {
        const bytes = Buffer.from(bounded(data) ?? '', 'base64url');
        const decoded = decodeText(bytes.toString('latin1'), {
          ...partHeaders,
          'content-transfer-encoding': ['8bit'],
        });
        if (type === 'text/html') html = html ? `${html}\n${decoded}` : decoded;
        else text = text ? `${text}\n${decoded}` : decoded;
      }
    };
    visit(payload, 0);
  }
  if ((html?.length ?? 0) + (text?.length ?? 0) > MAX_BYTES) throw new Error('EMAIL_TOO_LARGE');
  const from = headers.from;
  const sender = from?.length === 1 ? normalizeSender(from[0]) : extractGmailSender(object);
  if (!sender || (from && from.length !== 1)) throw new Error('INVALID_EMAIL_SENDER');
  const rawDate = typeof object.internalDate === 'string' ? Number(object.internalDate) : NaN;
  const received = typeof object.date === 'string' ? object.date : (headers.date?.[0] ?? '');
  const date = Number.isFinite(rawDate) ? new Date(rawDate) : new Date(received);
  if (!Number.isFinite(date.getTime())) throw new Error('INVALID_RECEIVED_DATE');
  const labels = object.labelIds ?? object.labels;
  return {
    messageId: object.id,
    ...(typeof object.threadId === 'string' ? { threadId: object.threadId.slice(0, 128) } : {}),
    receivedAt: date.toISOString(),
    sender,
    headers,
    html,
    text,
    labels: Array.isArray(labels)
      ? labels
          .map((label) => {
            if (typeof label === 'string') return label;
            const id = record(label).id;
            return typeof id === 'string' ? id : '';
          })
          .filter(Boolean)
          .slice(0, 100)
      : [],
  };
}
