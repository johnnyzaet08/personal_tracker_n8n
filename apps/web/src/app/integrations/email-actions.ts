'use server';

import {
  emailSourceConfigurationInputSchema,
  emailSourceConfigurationPatchSchema,
  emailSourceConfigurationSchema,
  emailSourceOptionsSchema,
  emailSyncPreviewRequestSchema,
  emailSyncRunSchema,
  emailSyncSelectionRequestSchema,
  paginationQuerySchema,
  uuidSchema,
  type EmailSourceConfiguration,
  type EmailSourceOptions,
  type EmailSyncRun,
  type PaginatedResponse,
} from '@tracker/contracts';
import { ApiError, apiGet, apiRequest } from '@/lib/api';
import type { EmailActionResult } from '@/lib/email-ui';

function failure(error: unknown): { ok: false; error: string; correlationId?: string } {
  if (error instanceof ApiError) {
    const messages: Record<number, string> = {
      400: 'Revisa los datos y el período. Solo se permite el mes actual de Costa Rica.',
      401: 'La API no autorizó la operación. Revisa la configuración de acceso local.',
      403: 'La fuente no permite esta operación o no pertenece al entorno actual.',
      404: 'La fuente o búsqueda ya no está disponible. Actualiza la lista.',
      409: 'Ya existe una búsqueda activa o la selección cambió. Actualiza su estado antes de continuar.',
      410: 'La previsualización venció. Inicia una búsqueda nueva.',
      422: 'La configuración o selección no es válida. Revisa los campos.',
      429: 'Hay demasiadas solicitudes. Espera un momento y vuelve a intentar.',
      503: 'El servicio de sincronización no está disponible. Consulta el estado antes de reintentar.',
    };
    return {
      ok: false,
      error:
        messages[error.status] ??
        'No se pudo completar la operación. Actualiza el estado e intenta de nuevo.',
      ...(error.correlationId ? { correlationId: error.correlationId } : {}),
    };
  }
  return {
    ok: false,
    error: 'No se pudo conectar con la API. Actualiza el estado antes de reintentar.',
  };
}

const invalid = (): { ok: false; error: string } => ({
  ok: false,
  error: 'Revisa los campos obligatorios, la dirección, la moneda y la selección.',
});

// Every action calls the public API, which resolves the fixed local tenant and checks ownership.
// No service credential or client-provided tenant is used by the dashboard.
export async function loadEmailSources(
  page = 1,
): Promise<EmailActionResult<PaginatedResponse<EmailSourceConfiguration>>> {
  const pagination = paginationQuerySchema.safeParse({ page, pageSize: 10 });
  if (!pagination.success) return invalid();
  try {
    const response = await apiGet<PaginatedResponse<unknown>>(
      `/api/v1/email-sources?page=${pagination.data.page}&pageSize=10`,
    );
    return {
      ok: true,
      data: {
        ...response,
        data: response.data.map((source) => emailSourceConfigurationSchema.parse(source)),
      },
    };
  } catch (error) {
    return failure(error);
  }
}

export async function loadEmailSourceOptions(): Promise<EmailActionResult<EmailSourceOptions>> {
  try {
    return {
      ok: true,
      data: emailSourceOptionsSchema.parse(await apiGet('/api/v1/email-sources/options')),
    };
  } catch (error) {
    return failure(error);
  }
}

export async function saveEmailSource(
  id: string | null,
  form: FormData,
): Promise<EmailActionResult<EmailSourceConfiguration>> {
  if (id !== null && !uuidSchema.safeParse(id).success) return invalid();
  const parsed = emailSourceConfigurationInputSchema.safeParse({
    schemaVersion: 1,
    integrationId: form.get('integrationId'),
    displayName: form.get('displayName'),
    senderAddress: form.get('senderAddress'),
    institutionName: form.get('institutionName'),
    adapterKey: form.get('adapterKey'),
    accountId: form.get('accountId') || null,
    defaultCurrency:
      typeof form.get('defaultCurrency') === 'string'
        ? String(form.get('defaultCurrency')).trim().toUpperCase() || null
        : null,
    autoIngestionEnabled: form.get('autoIngestionEnabled') === 'on',
    manualSyncEnabled: form.get('manualSyncEnabled') === 'on',
    status: form.get('status'),
  });
  if (!parsed.success) return invalid();
  try {
    return {
      ok: true,
      data: emailSourceConfigurationSchema.parse(
        await apiRequest(
          id ? `/api/v1/email-sources/${id}` : '/api/v1/email-sources',
          id ? 'PATCH' : 'POST',
          parsed.data,
        ),
      ),
    };
  } catch (error) {
    return failure(error);
  }
}

export async function patchEmailSource(
  id: string,
  input: unknown,
): Promise<EmailActionResult<EmailSourceConfiguration>> {
  const parsed = emailSourceConfigurationPatchSchema.safeParse(input);
  if (!uuidSchema.safeParse(id).success || !parsed.success) return invalid();
  try {
    return {
      ok: true,
      data: emailSourceConfigurationSchema.parse(
        await apiRequest(`/api/v1/email-sources/${id}`, 'PATCH', parsed.data),
      ),
    };
  } catch (error) {
    return failure(error);
  }
}

export async function loadEmailRuns(
  sourceId: string,
  page = 1,
): Promise<EmailActionResult<PaginatedResponse<EmailSyncRun>>> {
  const pagination = paginationQuerySchema.safeParse({ page, pageSize: 10 });
  if (!uuidSchema.safeParse(sourceId).success || !pagination.success) return invalid();
  try {
    const response = await apiGet<PaginatedResponse<unknown>>(
      `/api/v1/email-sync-runs?sourceId=${sourceId}&page=${pagination.data.page}&pageSize=10`,
    );
    return {
      ok: true,
      data: { ...response, data: response.data.map((run) => emailSyncRunSchema.parse(run)) },
    };
  } catch (error) {
    return failure(error);
  }
}

export async function loadEmailRun(id: string): Promise<EmailActionResult<EmailSyncRun>> {
  if (!uuidSchema.safeParse(id).success) return invalid();
  try {
    return {
      ok: true,
      data: emailSyncRunSchema.parse(await apiGet(`/api/v1/email-sync-runs/${id}`)),
    };
  } catch (error) {
    return failure(error);
  }
}

export async function previewEmailSource(
  id: string,
  input: unknown,
): Promise<EmailActionResult<EmailSyncRun>> {
  const parsed = emailSyncPreviewRequestSchema.safeParse(input);
  if (!uuidSchema.safeParse(id).success || !parsed.success) return invalid();
  try {
    return {
      ok: true,
      data: emailSyncRunSchema.parse(
        await apiRequest(`/api/v1/email-sources/${id}/preview`, 'POST', parsed.data),
      ),
    };
  } catch (error) {
    return failure(error);
  }
}

export async function processEmailSelection(
  id: string,
  input: unknown,
): Promise<EmailActionResult<EmailSyncRun>> {
  const parsed = emailSyncSelectionRequestSchema.safeParse(input);
  if (!uuidSchema.safeParse(id).success || !parsed.success) return invalid();
  try {
    return {
      ok: true,
      data: emailSyncRunSchema.parse(
        await apiRequest(`/api/v1/email-sync-previews/${id}/process`, 'POST', parsed.data),
      ),
    };
  } catch (error) {
    return failure(error);
  }
}

export async function cancelEmailPreview(id: string): Promise<EmailActionResult<EmailSyncRun>> {
  if (!uuidSchema.safeParse(id).success) return invalid();
  try {
    return {
      ok: true,
      data: emailSyncRunSchema.parse(
        await apiRequest(`/api/v1/email-sync-runs/${id}/cancel`, 'POST', { schemaVersion: 1 }),
      ),
    };
  } catch (error) {
    return failure(error);
  }
}
