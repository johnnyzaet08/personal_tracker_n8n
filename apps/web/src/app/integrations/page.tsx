import type { PaginatedResponse } from '@tracker/contracts';
import { Database, Mail, Network, ServerCog } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatusPill } from '@/components/status-pill';
import { EmailSourcesManager } from '@/components/email-sources-manager';
import { EmailFeedback } from '@/components/email-feedback';
import { loadEmailSourceOptions, loadEmailSources } from './email-actions';
import { apiGet } from '@/lib/api';
import type { IntegrationRecord, IntegrationStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const [status, records, sources, sourceOptions] = await Promise.all([
    apiGet<IntegrationStatus>('/api/v1/integrations/status'),
    apiGet<PaginatedResponse<IntegrationRecord>>('/api/v1/integrations'),
    loadEmailSources(),
    loadEmailSourceOptions(),
  ]);
  const items = [
    {
      name: 'PostgreSQL',
      description: 'Fuente oficial de datos',
      status: status.postgresql,
      icon: Database,
    },
    {
      name: 'API',
      description: 'Capa de acceso y validación',
      status: status.api,
      icon: ServerCog,
    },
    {
      name: 'n8n',
      description: 'Orquestación de automatizaciones',
      status: status.n8n,
      icon: Network,
    },
    {
      name: 'Gmail',
      description: 'Ingesta de correo normalizado',
      status: status.gmail === 'pending' ? 'pendiente de configuración' : status.gmail,
      icon: Mail,
    },
  ];
  return (
    <>
      <PageHeader
        title="Integraciones"
        description="Salud de infraestructura y estado real de cada proveedor."
      />
      <section className="integration-grid">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <article className="integration-card" key={item.name}>
              <span className="integration-icon">
                <Icon size={23} aria-hidden="true" />
              </span>
              <div>
                <h2>{item.name}</h2>
                <p>{item.description}</p>
              </div>
              <StatusPill status={item.status} />
            </article>
          );
        })}
      </section>
      {sources.ok && sourceOptions.ok ? (
        <EmailSourcesManager initialSources={sources.data} options={sourceOptions.data} />
      ) : (
        <section className="panel">
          <h2>Fuentes de correo</h2>
          <EmailFeedback error={!sources.ok ? sources : !sourceOptions.ok ? sourceOptions : null} />
          <p>Recarga la página para volver a consultar la configuración.</p>
        </section>
      )}
      <section className="panel disclosure email-integration-detail">
        <h2>Estado de Gmail</h2>
        <p>
          Las fuentes activas determinan qué remitentes se pueden analizar. La búsqueda manual
          conserva el estado no leído y requiere seleccionar los mensajes antes de procesarlos.
        </p>
        <dl>
          <div>
            <dt>Registros de integración</dt>
            <dd>{records.pagination.total}</dd>
          </div>
          <div>
            <dt>Última sincronización</dt>
            <dd>
              {status.gmailLastSyncAt
                ? new Date(status.gmailLastSyncAt).toLocaleString('es-CR', {
                    timeZone: 'America/Costa_Rica',
                  })
                : 'Nunca'}
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}
