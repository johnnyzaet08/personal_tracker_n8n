import type { PaginatedResponse } from '@tracker/contracts';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusPill } from '@/components/status-pill';
import { apiGet } from '@/lib/api';
import type { ReviewRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ReviewPage() {
  const response = await apiGet<PaginatedResponse<ReviewRecord>>('/api/v1/review-queue');
  return (
    <>
      <PageHeader
        title="Alertas y revisión"
        description="Eventos ambiguos que requieren una decisión humana."
      />
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Cola de revisión</h2>
            <p>{response.pagination.total} elementos</p>
          </div>
        </div>
        {response.data.length === 0 ? (
          <EmptyState
            title="Todo está al día"
            description="No hay eventos esperando revisión manual."
          />
        ) : (
          <div className="card-list">
            {response.data.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.reason}</strong>
                  <small>
                    {new Date(item.createdAt).toLocaleString('es-CR')} · prioridad {item.priority}
                  </small>
                </div>
                <StatusPill status={item.status} />
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
