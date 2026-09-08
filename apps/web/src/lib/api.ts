import 'server-only';
import { randomUUID } from 'node:crypto';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly correlationId?: string,
  ) {
    super(message);
  }
}

function apiBaseUrl(): string {
  const value = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!value) throw new Error('API_INTERNAL_URL or NEXT_PUBLIC_API_URL must be configured');
  return value.replace(/\/$/u, '');
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path);
}

export async function apiRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' = 'GET',
  body?: unknown,
): Promise<T> {
  const tenantId = process.env.LOCAL_TENANT_ID;
  const correlationId = randomUUID();
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method,
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
    headers: {
      accept: 'application/json',
      'x-correlation-id': correlationId,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const error =
      payload && typeof payload === 'object' && 'error' in payload ? payload.error : payload;
    const code =
      error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : undefined;
    // Never surface arbitrary upstream messages, request values or error bodies.
    throw new ApiError(
      `La API respondió con estado ${response.status}`,
      response.status,
      code && /^[A-Z][A-Z0-9_]{0,79}$/u.test(code) ? code : undefined,
      correlationId,
    );
  }
  return (await response.json()) as T;
}

export function queryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}
