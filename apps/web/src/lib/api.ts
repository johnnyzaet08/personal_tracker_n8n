import { randomUUID } from 'node:crypto';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
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
  const tenantId = process.env.LOCAL_TENANT_ID;
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'x-correlation-id': randomUUID(),
      ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
    },
  });
  if (!response.ok) {
    throw new ApiError(`La API respondió con estado ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}

export async function apiWrite<T>(
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown,
): Promise<T> {
  const tenantId = process.env.LOCAL_TENANT_ID;
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method,
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-correlation-id': randomUUID(),
      ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new ApiError(`La API respondió con estado ${response.status}`, response.status);
  return (await response.json()) as T;
}

export function queryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}
