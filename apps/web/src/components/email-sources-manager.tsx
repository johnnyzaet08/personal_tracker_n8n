'use client';

import { useCallback, useRef, useState, useTransition } from 'react';
import type {
  EmailSourceConfiguration,
  EmailSourceOptions,
  PaginatedResponse,
} from '@tracker/contracts';
import { Mail, Pencil, Plus, RefreshCw, Search } from 'lucide-react';
import { loadEmailSources, patchEmailSource } from '@/app/integrations/email-actions';
import { EmailFeedback } from '@/components/email-feedback';
import { EmailSourceEditor } from '@/components/email-source-editor';
import { EmailSyncPanel } from '@/components/email-sync-panel';
import { EmptyState } from '@/components/empty-state';
import { formatEmailDate, runLabels, safeEmailCode, type EmailActionResult } from '@/lib/email-ui';

export function EmailSourcesManager({
  initialSources,
  options,
}: {
  initialSources: PaginatedResponse<EmailSourceConfiguration>;
  options: EmailSourceOptions;
}) {
  const [sources, setSources] = useState(initialSources);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(
    initialSources.data[0]?.id ?? null,
  );
  const [editor, setEditor] = useState<EmailSourceConfiguration | 'new' | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<Extract<EmailActionResult<unknown>, { ok: false }> | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const syncHeading = useRef<HTMLDivElement>(null);
  const selectedSource = sources.data.find((source) => source.id === selectedSourceId) ?? null;

  const refreshSources = useCallback(async () => {
    try {
      const response = await loadEmailSources(sources.pagination.page);
      if (response.ok) setSources(response.data);
      else setError(response);
    } catch {
      setError({ ok: false, error: 'No se pudo actualizar la lista de fuentes.' });
    }
  }, [sources.pagination.page]);

  function goToPage(page: number) {
    setError(null);
    startTransition(async () => {
      try {
        const response = await loadEmailSources(page);
        if (response.ok) {
          setSources(response.data);
          setSelectedSourceId(response.data.data[0]?.id ?? null);
        } else setError(response);
      } catch {
        setError({ ok: false, error: 'No se pudo cargar esta página. Intenta de nuevo.' });
      }
    });
  }

  function changeSource(source: EmailSourceConfiguration, patch: Record<string, unknown>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const response = await patchEmailSource(source.id, patch);
        if (response.ok) {
          setSources((current) => ({
            ...current,
            data: current.data.map((item) => (item.id === source.id ? response.data : item)),
          }));
          setNotice('Configuración de fuente actualizada.');
        } else setError(response);
      } catch {
        setError({
          ok: false,
          error: 'No se pudo guardar el cambio. Actualiza la lista antes de reintentar.',
        });
      }
    });
  }

  return (
    <div className="email-workspace">
      <section
        className="panel email-sources"
        aria-labelledby="email-sources-title"
        aria-busy={pending}
      >
        <div className="panel-heading email-section-heading">
          <div>
            <p className="eyebrow">Gmail</p>
            <h2 id="email-sources-title">Fuentes de correo</h2>
            <p>
              Configura una dirección y elige qué correos analizar. Los mensajes conservan su estado
              no leído.
            </p>
          </div>
          <div className="email-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={pending}
              onClick={() => startTransition(refreshSources)}
              aria-label="Actualizar fuentes"
            >
              <RefreshCw size={15} aria-hidden="true" />
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setEditor('new');
                setNotice(null);
              }}
            >
              <Plus size={16} aria-hidden="true" />
              Nueva fuente
            </button>
          </div>
        </div>
        <EmailFeedback error={error} />
        {notice ? (
          <p className="email-feedback email-feedback-success" role="status">
            {notice}
          </p>
        ) : null}
        {sources.data.length === 0 ? (
          <EmptyState
            title="Todavía no hay fuentes de correo"
            description="Agrega una dirección remitente y su adapter para comenzar."
          />
        ) : (
          <div className="email-source-list">
            {sources.data.map((source) => {
              const adapter = options.adapters.find((item) => item.key === source.adapterKey);
              const resultLabel =
                source.lastResult && source.lastResult in runLabels
                  ? runLabels[source.lastResult as keyof typeof runLabels]
                  : source.lastResult
                    ? 'Resultado registrado'
                    : 'Sin ejecuciones';
              return (
                <article
                  className={`email-source-card${source.id === selectedSourceId ? ' selected' : ''}`}
                  key={source.id}
                >
                  <div className="email-source-main">
                    <span className="email-source-icon">
                      <Mail size={20} aria-hidden="true" />
                    </span>
                    <div>
                      <h3>{source.displayName}</h3>
                      <p className="email-address">{source.senderAddress}</p>
                      <small>
                        {source.institutionName} · {adapter?.displayName ?? source.adapterKey}
                      </small>
                    </div>
                    <span className={`status-pill status-${source.status}`}>
                      {source.status === 'active' ? 'Activa' : 'Desactivada'}
                    </span>
                  </div>
                  <dl className="email-source-details">
                    <div>
                      <dt>Automática</dt>
                      <dd>{source.autoIngestionEnabled ? 'Habilitada' : 'Deshabilitada'}</dd>
                    </div>
                    <div>
                      <dt>Última sincronización</dt>
                      <dd>
                        {source.lastSyncAt ? formatEmailDate(source.lastSyncAt, true) : 'Nunca'}
                      </dd>
                    </div>
                    <div>
                      <dt>Último resultado</dt>
                      <dd>
                        {source.lastErrorCode
                          ? `Error · ${safeEmailCode(source.lastErrorCode)}`
                          : resultLabel}
                      </dd>
                    </div>
                  </dl>
                  <div className="email-source-controls">
                    <div className="email-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={pending}
                        onClick={() => setEditor(source)}
                        aria-label={`Editar ${source.displayName}`}
                      >
                        <Pencil size={14} aria-hidden="true" />
                        Editar
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          changeSource(source, {
                            status: source.status === 'active' ? 'disabled' : 'active',
                          })
                        }
                      >
                        {source.status === 'active' ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={source.status !== 'active' || !source.manualSyncEnabled || pending}
                      onClick={() => {
                        setSelectedSourceId(source.id);
                        requestAnimationFrame(() =>
                          syncHeading.current?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                          }),
                        );
                      }}
                    >
                      <Search size={15} aria-hidden="true" />
                      Buscar correos
                    </button>
                  </div>
                  {!source.manualSyncEnabled ? (
                    <p className="email-source-note">
                      Sincronización manual deshabilitada. Puedes habilitarla al editar.
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
        {sources.pagination.totalPages > 1 ? (
          <nav className="pagination email-pagination" aria-label="Paginación de fuentes">
            <button
              type="button"
              className="text-button"
              disabled={pending || sources.pagination.page <= 1}
              onClick={() => goToPage(sources.pagination.page - 1)}
            >
              Anterior
            </button>
            <span>
              Página {sources.pagination.page} de {sources.pagination.totalPages}
            </span>
            <button
              type="button"
              className="text-button"
              disabled={pending || sources.pagination.page >= sources.pagination.totalPages}
              onClick={() => goToPage(sources.pagination.page + 1)}
            >
              Siguiente
            </button>
          </nav>
        ) : null}
      </section>
      {editor ? (
        <EmailSourceEditor
          key={editor === 'new' ? 'new' : editor.id}
          source={editor === 'new' ? null : editor}
          options={options}
          onClose={() => setEditor(null)}
          onSaved={(saved) => {
            setEditor(null);
            setNotice('Fuente guardada.');
            setSources((current) => ({
              ...current,
              data: current.data.some((item) => item.id === saved.id)
                ? current.data.map((item) => (item.id === saved.id ? saved : item))
                : [saved, ...current.data].slice(0, 10),
              pagination: {
                ...current.pagination,
                total: current.data.some((item) => item.id === saved.id)
                  ? current.pagination.total
                  : current.pagination.total + 1,
              },
            }));
            setSelectedSourceId(saved.id);
          }}
        />
      ) : null}
      <div ref={syncHeading} className="email-sync-anchor">
        {selectedSource ? (
          <EmailSyncPanel
            key={selectedSource.id}
            source={selectedSource}
            options={options}
            onCompleted={refreshSources}
          />
        ) : null}
      </div>
    </div>
  );
}
