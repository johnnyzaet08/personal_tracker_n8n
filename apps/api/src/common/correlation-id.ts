import { randomUUID } from 'node:crypto';

export function correlationId(value: unknown): string {
  // Correlation accepts UUIDs and opaque provider/execution IDs, never arbitrary header text.
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(value) ? value : randomUUID();
}
