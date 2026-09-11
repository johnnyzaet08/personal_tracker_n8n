import type { EmailSyncRun, EmailSyncRunResult } from '@tracker/contracts';

export type EmailActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; correlationId?: string };

export const runLabels: Record<EmailSyncRun['status'], string> = {
  pending: 'En espera',
  fetching: 'Buscando correos',
  awaiting_selection: 'Selecciona los correos',
  processing: 'Analizando seleccionados',
  completed: 'Completado',
  partially_completed: 'Completado con incidencias',
  failed: 'No se pudo completar',
  cancelled: 'Cancelado',
};

export const classificationLabels: Record<string, string> = {
  new: 'Nuevo',
  exact_duplicate: 'Duplicado exacto',
  already_processed: 'Ya procesado',
  conflict: 'Diferencia · a revisión',
  requires_review: 'Requiere revisión',
  ignored_outside_period: 'Fuera del período',
  invalid: 'No válido',
};

export const resultLabels: Array<[keyof Omit<EmailSyncRunResult, 'errors'>, string]> = [
  ['found', 'Encontrados'],
  ['eligible', 'Elegibles'],
  ['selected', 'Seleccionados'],
  ['new', 'Nuevos'],
  ['duplicates', 'Duplicados'],
  ['inReview', 'En revisión'],
  ['ignoredOutsidePeriod', 'Fuera de fecha'],
  ['invalid', 'Inválidos'],
  ['updated', 'Actualizados'],
];

export function isRunning(status: EmailSyncRun['status']): boolean {
  return status === 'pending' || status === 'fetching' || status === 'processing';
}

export function formatEmailDate(value: string | null | undefined, includeTime = false): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CR', {
    timeZone: 'America/Costa_Rica',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function monthLastDay(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return `${month}-${new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()}`;
}

export function safeEmailCode(code: string | null | undefined): string {
  return code && /^[A-Z][A-Z0-9_]{0,79}$/u.test(code) ? code : 'PROCESSING_ERROR';
}
