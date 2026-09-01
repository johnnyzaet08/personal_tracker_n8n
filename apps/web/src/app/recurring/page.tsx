import type { PaginatedResponse } from '@tracker/contracts';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusPill } from '@/components/status-pill';
import { apiGet } from '@/lib/api';
import type { RecurringRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function RecurringPage() {
  const response = await apiGet<PaginatedResponse<RecurringRecord>>('/api/v1/recurring-payments');
  return (
    <>
      <PageHeader
        title="Recurrentes"
        description="Cargos previstos y sus próximas fechas, sin detección automática en esta fase."
      />
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Pagos recurrentes</h2>
            <p>{response.pagination.total} patrones registrados</p>
          </div>
        </div>
        {response.data.length === 0 ? (
          <EmptyState
            title="No hay pagos recurrentes"
            description="El modelo está listo; la detección se habilitará cuando existan transacciones reales suficientes."
          />
        ) : (
          <div className="card-list">
            {response.data.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.merchant?.displayName ?? 'Comercio pendiente'} · {item.frequency}
                  </small>
                </div>
                <div className="card-end">
                  <strong>
                    {item.expectedAmount ?? '—'} {item.currency}
                  </strong>
                  <StatusPill status={item.status} />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
