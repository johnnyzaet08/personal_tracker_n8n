import Link from 'next/link';
import type { PaginatedResponse } from '@tracker/contracts';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { StatusPill } from '@/components/status-pill';
import { apiGet } from '@/lib/api';
import type { ReviewRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const search = await searchParams;
  const page = /^\d{1,6}$/u.test(search.page ?? '') ? Math.max(1, Number(search.page)) : 1;
  const response = await apiGet<PaginatedResponse<ReviewRecord>>(
    `/api/v1/review-queue?status=pending&pageSize=50&page=${page}`,
  );

  return (
    <>
      <PageHeader title="Alertas" description="Eventos pendientes de revisión manual." />
      <section className="panel review-alerts-panel">
        <div className="panel-heading compact-heading">
          <h2>{response.pagination.total} alertas pendientes</h2>
        </div>
        {response.pagination.total === 0 ? (
          <EmptyState
            title="No hay alertas pendientes"
            description="No hay eventos esperando revisión manual."
          />
        ) : response.data.length === 0 ? (
          <div className="compact-empty">
            Esta página no tiene alertas. <Link href="/alerts">Volver al inicio</Link>
          </div>
        ) : (
          <div className="alert-strip">
            {response.data.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.reason}</strong>
                  <small>
                    {new Date(item.createdAt).toLocaleString('es-CR', {
                      timeZone: 'America/Costa_Rica',
                    })}{' '}
                    · prioridad {item.priority}
                  </small>
                </div>
                <StatusPill status={item.status} />
              </article>
            ))}
          </div>
        )}
        {response.pagination.totalPages > 1 ? (
          <nav className="pagination" aria-label="Paginación de alertas">
            {page > 1 ? (
              <Link href={`/alerts?page=${page - 1}`}>Anterior</Link>
            ) : (
              <span>Anterior</span>
            )}
            <span>
              Página {page} de {response.pagination.totalPages}
            </span>
            {page < response.pagination.totalPages ? (
              <Link href={`/alerts?page=${page + 1}`}>Siguiente</Link>
            ) : (
              <span>Siguiente</span>
            )}
          </nav>
        ) : null}
      </section>
    </>
  );
}
