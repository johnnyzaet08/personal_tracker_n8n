'use client';

import {
  startTransition as startReactTransition,
  useCallback,
  useEffect,
  useState,
  useTransition,
} from 'react';
import type {
  EmailSourceConfiguration,
  EmailSourceOptions,
  EmailSyncRun,
  PaginatedResponse,
} from '@tracker/contracts';
import { CheckCircle2, Clock3, LoaderCircle, RefreshCw, Search } from 'lucide-react';
import {
  cancelEmailPreview,
  loadEmailRun,
  loadEmailRuns,
  previewEmailSource,
  processEmailSelection,
} from '@/app/integrations/email-actions';
import { EmailFeedback } from '@/components/email-feedback';
import { EmptyState } from '@/components/empty-state';
import {
  classificationLabels,
  formatEmailDate,
  isRunning,
  monthLastDay,
  resultLabels,
  runLabels,
  safeEmailCode,
  type EmailActionResult,
} from '@/lib/email-ui';

type UiError = Extract<EmailActionResult<unknown>, { ok: false }>;
const connectionError: UiError = {
  ok: false,
  error:
    'Se interrumpió la consulta. Actualiza el estado; la ejecución puede continuar en segundo plano.',
};

export function EmailSyncPanel({
  source,
  options,
  onCompleted,
}: {
  source: EmailSourceConfiguration;
  options: EmailSourceOptions;
  onCompleted: () => Promise<void>;
}) {
  const [period, setPeriod] = useState<'current_month' | 'exact_date'>('current_month');
  const [exactDate, setExactDate] = useState(options.today);
  const [run, setRun] = useState<EmailSyncRun | null>(null);
  const [history, setHistory] = useState<PaginatedResponse<EmailSyncRun> | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [error, setError] = useState<UiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [pollError, setPollError] = useState<UiError | null>(null);

  const receiveRun = useCallback((updated: EmailSyncRun) => {
    setRun(updated);
    setHistory((current) =>
      current
        ? {
            ...current,
            data: current.data.some((item) => item.id === updated.id)
              ? current.data.map((item) => (item.id === updated.id ? updated : item))
              : [updated, ...current.data].slice(0, 10),
          }
        : current,
    );
  }, []);

  useEffect(() => {
    let disposed = false;
    startReactTransition(async () => {
      try {
        const response = await loadEmailRuns(source.id);
        if (disposed) return;
        if (response.ok) {
          setHistory(response.data);
          setRun(
            response.data.data.find(
              (item) => isRunning(item.status) || item.status === 'awaiting_selection',
            ) ??
              response.data.data[0] ??
              null,
          );
        } else setError(response);
      } catch {
        if (!disposed) setError(connectionError);
      } finally {
        if (!disposed) setLoading(false);
      }
    });
    return () => {
      disposed = true;
    };
  }, [source.id]);

  const runId = run?.id;
  const runStatus = run?.status;
  useEffect(() => {
    if (!runId || !runStatus || !isRunning(runStatus)) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await loadEmailRun(runId);
        if (disposed) return;
        if (response.ok) {
          setPollError(null);
          receiveRun(response.data);
          if (!isRunning(response.data.status)) {
            await onCompleted();
            return;
          }
        } else setPollError(response);
      } catch {
        if (!disposed) setPollError(connectionError);
      }
      if (!disposed) timer = setTimeout(() => startReactTransition(poll), 4000);
    };
    timer = setTimeout(() => startReactTransition(poll), 1500);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [runId, runStatus, onCompleted, receiveRun]);

  const activeRun = history?.data.find(
    (item) => isRunning(item.status) || item.status === 'awaiting_selection',
  );
  const sourceEnabled = source.status === 'active' && source.manualSyncEnabled;
  const busy = pending || loading;
  const locked =
    Boolean(activeRun) ||
    Boolean(run && (isRunning(run.status) || run.status === 'awaiting_selection'));
  const choosing = run?.status === 'awaiting_selection';
  const eligibleIds =
    run?.candidates.filter((candidate) => candidate.eligible).map((candidate) => candidate.id) ??
    [];
  const selectedIds = selection.filter((id) => eligibleIds.includes(id));

  function search() {
    if (period === 'exact_date' && !exactDate.startsWith(`${options.currentMonth}-`)) {
      setError({
        ok: false,
        error: 'La fecha exacta debe pertenecer al mes actual de Costa Rica.',
      });
      return;
    }
    setError(null);
    setPollError(null);
    const idempotencyKey = previewKey ?? crypto.randomUUID();
    setPreviewKey(idempotencyKey);
    startTransition(async () => {
      try {
        const response = await previewEmailSource(source.id, {
          schemaVersion: 1,
          period,
          ...(period === 'exact_date' ? { exactDate } : {}),
          idempotencyKey,
        });
        if (response.ok) {
          receiveRun(response.data);
          setSelection([]);
          setPreviewKey(null);
        } else setError(response);
      } catch {
        setError(connectionError);
      }
    });
  }

  function refresh() {
    setError(null);
    setPollError(null);
    startTransition(async () => {
      try {
        const response = await loadEmailRuns(source.id);
        if (!response.ok) {
          setError(response);
          return;
        }
        setHistory(response.data);
        const latest =
          response.data.data.find(
            (item) => isRunning(item.status) || item.status === 'awaiting_selection',
          ) ??
          response.data.data.find((item) => item.id === run?.id) ??
          response.data.data[0] ??
          null;
        if (latest?.id !== run?.id) setSelection([]);
        setRun(latest);
        setLoading(false);
        await onCompleted();
      } catch {
        setError(connectionError);
      }
    });
  }

  function processSelected() {
    if (!run || selectedIds.length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        const response = await processEmailSelection(run.id, {
          schemaVersion: 1,
          candidateIds: selectedIds,
        });
        if (response.ok) {
          receiveRun(response.data);
          if (!isRunning(response.data.status)) await onCompleted();
        } else setError(response);
      } catch {
        setError(connectionError);
      }
    });
  }

  function cancel() {
    if (!run || !choosing) return;
    setError(null);
    startTransition(async () => {
      try {
        const response = await cancelEmailPreview(run.id);
        if (response.ok) {
          receiveRun(response.data);
          setSelection([]);
          await onCompleted();
        } else setError(response);
      } catch {
        setError(connectionError);
      }
    });
  }

  return (
    <section className="panel email-sync" aria-labelledby="email-sync-title">
      <div className="panel-heading email-section-heading">
        <div>
          <p className="eyebrow">Sincronización de una fuente</p>
          <h2 id="email-sync-title">Buscar correos · {source.displayName}</h2>
          <p className="email-address">{source.senderAddress}</p>
        </div>
        <span className="period-chip">America/Costa_Rica</span>
      </div>
      <ol className="email-steps" aria-label="Pasos de sincronización">
        <li
          className={
            !run || (isRunning(run.status) && run.status !== 'processing') ? 'current' : ''
          }
        >
          <span>1</span>Buscar
        </li>
        <li className={choosing ? 'current' : ''}>
          <span>2</span>Seleccionar
        </li>
        <li
          className={
            run && ['processing', 'completed', 'partially_completed'].includes(run.status)
              ? 'current'
              : ''
          }
        >
          <span>3</span>Analizar y conciliar
        </li>
      </ol>
      <form
        className="email-period-form"
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
      >
        <fieldset disabled={busy || locked || !sourceEnabled} className="email-fieldset">
          <legend>Período de búsqueda</legend>
          <div className="email-period-inputs">
            <label className="email-radio">
              <input
                type="radio"
                name="period"
                value="current_month"
                checked={period === 'current_month'}
                onChange={() => {
                  setPeriod('current_month');
                  setPreviewKey(null);
                }}
              />
              <span>Mes actual · {options.currentMonth}</span>
            </label>
            <label className="email-radio">
              <input
                type="radio"
                name="period"
                value="exact_date"
                checked={period === 'exact_date'}
                onChange={() => {
                  setPeriod('exact_date');
                  setPreviewKey(null);
                }}
              />
              <span>Fecha exacta del mes</span>
            </label>
            {period === 'exact_date' ? (
              <label className="email-date-field">
                <span className="sr-only">Fecha exacta</span>
                <input
                  type="date"
                  required
                  min={`${options.currentMonth}-01`}
                  max={monthLastDay(options.currentMonth)}
                  value={exactDate}
                  onChange={(event) => {
                    setExactDate(event.target.value);
                    setPreviewKey(null);
                  }}
                />
              </label>
            ) : null}
            <button
              type="submit"
              className="primary-button"
              disabled={busy || locked || !sourceEnabled}
            >
              <Search size={15} aria-hidden="true" />
              {pending && !run ? 'Solicitando…' : 'Buscar correos'}
            </button>
          </div>
        </fieldset>
        <p>
          Hasta los últimos 10 correos no leídos de esta dirección. La fecha de la transacción
          determina si corresponde al período. La búsqueda no crea transacciones.
        </p>
      </form>
      {!sourceEnabled ? (
        <p className="notice">Esta fuente está desactivada o no permite sincronización manual.</p>
      ) : null}
      <EmailFeedback error={error} />
      <EmailFeedback error={pollError} />
      {activeRun && activeRun.id !== run?.id ? (
        <div className="email-feedback">
          <p>Hay una ejecución activa para esta fuente.</p>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setRun(activeRun);
              setSelection([]);
            }}
          >
            Volver a la ejecución activa
          </button>
        </div>
      ) : null}
      {loading ? (
        <div className="email-loading" role="status">
          <LoaderCircle className="email-spinner" size={20} aria-hidden="true" />
          Cargando búsquedas guardadas…
        </div>
      ) : null}
      {!loading && !run ? (
        <EmptyState
          title="Busca correos para comenzar"
          description="Elige el mes actual o una fecha del mes. Después podrás seleccionar individualmente los mensajes elegibles."
        />
      ) : null}
      {run ? (
        <div className="email-run">
          <div className="email-run-heading">
            <div className="email-run-status" role="status">
              {isRunning(run.status) ? (
                <LoaderCircle className="email-spinner" size={20} aria-hidden="true" />
              ) : run.status === 'completed' ? (
                <CheckCircle2 size={20} aria-hidden="true" />
              ) : (
                <Clock3 size={20} aria-hidden="true" />
              )}
              <div>
                <h3>{runLabels[run.status]}</h3>
                <p>
                  {run.exactDate ?? run.periodMonth} · Iniciada{' '}
                  {formatEmailDate(run.createdAt, true)}
                </p>
              </div>
            </div>
            <button className="secondary-button" type="button" disabled={pending} onClick={refresh}>
              <RefreshCw size={14} aria-hidden="true" />
              Actualizar estado
            </button>
          </div>
          {isRunning(run.status) ? (
            <p className="email-progress-note" role="status">
              {run.status === 'processing'
                ? 'Analizando únicamente los mensajes seleccionados. El resultado se actualiza automáticamente.'
                : 'Recuperando y preparando la previsualización. Puedes salir y volver: la ejecución queda guardada.'}
            </p>
          ) : null}
          {run.status === 'partially_completed' ? (
            <p className="notice">
              Algunos mensajes necesitan atención. Revisa el resultado por mensaje y los errores de
              esta ejecución.
            </p>
          ) : null}
          {run.status === 'failed' ? (
            <p className="email-feedback email-feedback-error" role="alert">
              La ejecución falló. Los resultados guardados permanecen disponibles.{' '}
              {run.lastErrorCode ? `Código: ${safeEmailCode(run.lastErrorCode)}.` : ''}
            </p>
          ) : null}
          {choosing ? (
            <p className="email-selection-note">
              Selecciona los correos que deseas analizar. Ninguno se selecciona automáticamente.
              Esta previsualización vence el {formatEmailDate(run.expiresAt, true)}.
            </p>
          ) : null}
          {run.candidates.length > 0 ? (
            <div className="table-scroll email-preview-table">
              <table>
                <caption className="sr-only">
                  Mensajes de {source.displayName}: fecha financiera, comercio, monto y estado de
                  conciliación.
                </caption>
                <thead>
                  <tr>
                    <th>Selección</th>
                    <th>Fecha de transacción</th>
                    <th>Comercio</th>
                    <th className="amount">Monto</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {run.candidates.map((candidate, index) => {
                    const financial = candidate.financial;
                    const classification =
                      candidate.processingResult?.classification ?? candidate.classification;
                    return (
                      <tr
                        key={candidate.id}
                        className={!candidate.eligible ? 'email-candidate-ineligible' : ''}
                      >
                        <td>
                          {choosing ? (
                            <label className="email-checkbox">
                              <input
                                type="checkbox"
                                aria-label={`Seleccionar correo ${index + 1}${financial?.merchant ? ` de ${financial.merchant}` : ''}`}
                                checked={selectedIds.includes(candidate.id)}
                                disabled={!candidate.eligible || pending || !sourceEnabled}
                                onChange={(event) =>
                                  setSelection((current) =>
                                    event.target.checked
                                      ? [...current, candidate.id]
                                      : current.filter((id) => id !== candidate.id),
                                  )
                                }
                              />
                              <span>Correo {index + 1}</span>
                            </label>
                          ) : (
                            <span>{candidate.selected ? 'Seleccionado' : 'Sin seleccionar'}</span>
                          )}
                          <small>Recibido {formatEmailDate(candidate.receivedAt, true)}</small>
                        </td>
                        <td>{formatEmailDate(financial?.occurredAt)}</td>
                        <td>{financial?.merchant ?? 'Pendiente de identificar'}</td>
                        <td className="amount">
                          {financial
                            ? `${financial.amount} ${financial.currency}`
                            : 'Sin monto confirmado'}
                        </td>
                        <td>
                          <span className={`status-pill email-classification-${classification}`}>
                            {classificationLabels[classification] ?? 'Pendiente'}
                          </span>
                          {!candidate.eligible ? <small>No elegible</small> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : !isRunning(run.status) ? (
            <EmptyState
              title="No hay mensajes elegibles para seleccionar"
              description="No se encontraron correos no leídos compatibles con esta dirección y período. Puedes iniciar otra búsqueda."
            />
          ) : null}
          {choosing ? (
            <div className="email-selection-actions">
              <span aria-live="polite">
                {selectedIds.length} de {eligibleIds.length} elegibles seleccionados
              </span>
              <div className="email-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={pending}
                  onClick={cancel}
                >
                  Descartar búsqueda
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={pending || selectedIds.length === 0 || !sourceEnabled}
                  onClick={processSelected}
                >
                  {pending ? 'Enviando selección…' : 'Analizar seleccionados'}
                </button>
              </div>
            </div>
          ) : null}
          <div className="email-results">
            <h3>Resultado de la ejecución</h3>
            <dl>
              {resultLabels.map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{run.result[key]}</dd>
                </div>
              ))}
            </dl>
            <p>
              Las diferencias financieras pasan a revisión. Las correcciones manuales se conservan.
            </p>
          </div>
          {run.result.errors.length > 0 ? (
            <div className="email-feedback email-feedback-error">
              <h4>Errores de procesamiento</h4>
              <ul>
                {run.result.errors.map((item, index) => (
                  <li key={`${item.code}-${index}`}>
                    No se completó una operación: {safeEmailCode(item.code)}.
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {!loading && error && !run ? (
        <button className="secondary-button" type="button" disabled={pending} onClick={refresh}>
          <RefreshCw size={14} aria-hidden="true" />
          Reintentar carga
        </button>
      ) : null}
      {history && history.data.length > 0 ? (
        <details className="email-history">
          <summary>Historial de búsquedas de esta fuente</summary>
          <ul>
            {history.data.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={run?.id === item.id ? 'selected' : ''}
                  disabled={pending}
                  onClick={() => {
                    setRun(item);
                    setSelection([]);
                    setError(null);
                  }}
                >
                  <span>
                    {formatEmailDate(item.createdAt, true)}
                    <small>{item.exactDate ?? item.periodMonth}</small>
                  </span>
                  <span>{runLabels[item.status]}</span>
                </button>
              </li>
            ))}
          </ul>
          {history.pagination.totalPages > 1 ? (
            <nav className="pagination email-pagination" aria-label="Paginación del historial">
              <button
                type="button"
                className="text-button"
                disabled={pending || history.pagination.page <= 1}
                onClick={() =>
                  startTransition(async () => {
                    const response = await loadEmailRuns(
                      source.id,
                      history.pagination.page - 1,
                    ).catch(() => connectionError);
                    if (response.ok) setHistory(response.data);
                    else setError(response);
                  })
                }
              >
                Anterior
              </button>
              <span>
                {history.pagination.page} de {history.pagination.totalPages}
              </span>
              <button
                type="button"
                className="text-button"
                disabled={pending || history.pagination.page >= history.pagination.totalPages}
                onClick={() =>
                  startTransition(async () => {
                    const response = await loadEmailRuns(
                      source.id,
                      history.pagination.page + 1,
                    ).catch(() => connectionError);
                    if (response.ok) setHistory(response.data);
                    else setError(response);
                  })
                }
              >
                Siguiente
              </button>
            </nav>
          ) : null}
        </details>
      ) : null}
    </section>
  );
}
