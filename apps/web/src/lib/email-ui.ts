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

const runErrorMessages: Record<string, string> = {
  GMAIL_CREDENTIALS_INVALID:
    'Gmail rechazó la credencial configurada. Reconecta la integración Gmail en n8n y vuelve a intentarlo.',
  GMAIL_RATE_LIMITED:
    'Gmail limitó temporalmente las solicitudes. Espera un momento antes de volver a intentarlo.',
  GMAIL_SERVICE_UNAVAILABLE:
    'Gmail no estaba disponible temporalmente. Vuelve a intentarlo en unos minutos.',
  GMAIL_REQUEST_FAILED:
    'Gmail rechazó la operación solicitada. Revisa la conexión y vuelve a intentarlo.',
  RUN_TIMEOUT:
    'La ejecución superó el límite de 3 minutos y se cerró. Verifica la credencial Gmail y la conectividad de n8n antes de reintentar.',
  RUN_EXPIRED:
    'La ejecución anterior venció antes de completarse. Verifica la credencial Gmail y la conectividad de n8n antes de reintentar.',
  PREVIEW_EXPIRED:
    'La previsualización venció antes de recibir una selección. Inicia una nueva búsqueda.',
  RUN_PERIOD_EXPIRED: 'La ejecución pertenece a un mes anterior. Inicia una nueva búsqueda.',
  INCOMPLETE_SELECTION: 'No fue posible procesar todos los correos seleccionados.',
  GMAIL_EXECUTION_FAILED:
    'Gmail no pudo completar la operación. Revisa la credencial y el estado de n8n.',
};

export function emailRunErrorMessage(code: string | null | undefined): string {
  return runErrorMessages[safeEmailCode(code)] ?? 'La ejecución no pudo completarse.';
}
