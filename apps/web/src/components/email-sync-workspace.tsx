'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { EmailSourceConfiguration, EmailSourceOptions } from '@tracker/contracts';
import { RefreshCw } from 'lucide-react';
import { loadSyncSources } from '@/app/integrations/email-actions';
import { EmailFeedback } from '@/components/email-feedback';
import { EmailSyncPanel } from '@/components/email-sync-panel';
import { EmptyState } from '@/components/empty-state';
import type { EmailActionResult } from '@/lib/email-ui';

export function EmailSyncWorkspace({
  initialSources,
  options,
  requestedSourceId,
}: {
  initialSources: EmailSourceConfiguration[];
  options: EmailSourceOptions;
  requestedSourceId?: string;
}) {
  const router = useRouter();
  const [sources, setSources] = useState(initialSources);
  const [selectedSourceId, setSelectedSourceId] = useState(
    initialSources.find((source) => source.id === requestedSourceId)?.id ??
      initialSources.find((source) => source.status === 'active' && source.manualSyncEnabled)?.id ??
      initialSources[0]?.id ??
      '',
  );
  const [error, setError] = useState<Extract<EmailActionResult<unknown>, { ok: false }> | null>(
    requestedSourceId && !initialSources.some((source) => source.id === requestedSourceId)
      ? { ok: false, error: 'La fuente solicitada ya no está disponible. Elige otra fuente.' }
      : null,
  );
  const [pending, startTransition] = useTransition();
  const selectedSource = sources.find((source) => source.id === selectedSourceId);

  const refreshSources = useCallback(async () => {
    const response = await loadSyncSources();
    if (response.ok) {
      setSources(response.data);
      setError(null);
      router.refresh();
    } else setError(response);
  }, [router]);

  return (
    <div className="email-workspace">
      <section className="panel email-sources" aria-busy={pending}>
        <div className="panel-heading email-section-heading">
          <h2>Sincronización de una fuente</h2>
          <button
            className="secondary-button"
            type="button"
            disabled={pending}
            title="Actualizar fuentes"
            aria-label="Actualizar fuentes"
            onClick={() => startTransition(refreshSources)}
          >
            <RefreshCw size={15} aria-hidden="true" />
          </button>
        </div>
        <EmailFeedback error={error} />
        {sources.length ? (
          <label className="email-field">
            Fuente de correo
            <select
              value={selectedSourceId}
              disabled={pending}
              onChange={(event) => {
                setSelectedSourceId(event.target.value);
                setError(null);
              }}
            >
              {!selectedSource ? <option value="">Elige una fuente</option> : null}
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.displayName} · {source.senderAddress}
                  {source.status !== 'active' || !source.manualSyncEnabled
                    ? ' · Solo historial'
                    : ''}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <EmptyState
            title="Todavía no hay fuentes de correo"
            description="Agrega una fuente en Integraciones."
          />
        )}
        <Link className="text-button" href="/integrations">
          Configurar fuentes
        </Link>
      </section>
      {selectedSource ? (
        <EmailSyncPanel
          key={selectedSource.id}
          source={selectedSource}
          options={options}
          onCompleted={refreshSources}
        />
      ) : null}
    </div>
  );
}
