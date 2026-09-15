import type { BudgetSummary, PaginatedResponse } from '@tracker/contracts';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusPill } from '@/components/status-pill';
import { apiGet } from '@/lib/api';
import { currentPeriodInCostaRica } from '@/lib/date';
import type { CategoryRecord, ReviewRecord } from '@/lib/types';
import { assignCategory } from './actions';

export const dynamic = 'force-dynamic';

type Uncategorized = {
  id: string;
  description: string;
  amount: string;
  currency: string;
  occurredAt: string;
  merchant: { displayName: string } | null;
};

type Planning = {
  period: string;
  currency: string;
  budget: BudgetSummary | null;
  categories: CategoryRecord[];
  uncategorized: Uncategorized[];
};

const money = (value: string, currency: string) =>
  new Intl.NumberFormat('es-CR', { style: 'currency', currency }).format(Number(value));

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; currency?: string }>;
}) {
  const search = await searchParams;
  const period = search.period ?? currentPeriodInCostaRica();
  const currency = (search.currency ?? 'CRC').toUpperCase();
  const [response, planning] = await Promise.all([
    apiGet<PaginatedResponse<ReviewRecord>>('/api/v1/review-queue?status=pending&pageSize=100'),
    apiGet<Planning>(`/api/v1/planning/summary?period=${period}&currency=${currency}`),
  ]);
  const activeCategories = planning.categories.filter(
    (category) => category.status === 'active' && category.type === 'expense',
  );

  return (
    <>
      <PageHeader
        title="Alertas y revisión"
        description="Atiende primero las alertas y clasifica debajo los gastos que aún no tienen categoría."
        actions={
          <form className="period-selector">
            <input name="period" type="month" defaultValue={period} />
            <select name="currency" defaultValue={currency}>
              <option>CRC</option>
              <option>USD</option>
            </select>
            <button className="primary-button">Ver</button>
          </form>
        }
      />
      <section className="panel review-alerts-panel">
        <div className="panel-heading compact-heading">
          <div>
            <h2>Alertas</h2>
            <p>{response.pagination.total} elementos requieren una decisión humana</p>
          </div>
        </div>
        {response.data.length === 0 ? (
          <div className="compact-empty">No hay eventos esperando revisión manual.</div>
        ) : (
          <div className="alert-strip">
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
      <section className="panel review-expenses-panel">
        <div className="panel-heading">
          <div>
            <h2>Revisión de gastos</h2>
            <p>
              {planning.uncategorized.length} gastos confirmados sin categoría en {period}. Al
              asignarlos se incorporan al plan mensual.
            </p>
          </div>
        </div>
        {planning.uncategorized.length === 0 ? (
          <EmptyState
            title="Todo está clasificado"
            description="No hay gastos confirmados pendientes de categoría en este período."
          />
        ) : activeCategories.length === 0 ? (
          <EmptyState
            title="Primero crea una categoría"
            description="Necesitas al menos una categoría activa en Plan mensual antes de clasificar gastos."
          />
        ) : (
          <div className="card-list review-expense-list">
            {planning.uncategorized.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.merchant?.displayName ?? item.description}</strong>
                  <small>
                    {item.occurredAt.slice(0, 10)} · {money(item.amount, item.currency)}
                  </small>
                </div>
                <form action={assignCategory} className="assign-form">
                  <input type="hidden" name="transactionId" value={item.id} />
                  <input type="hidden" name="period" value={period} />
                  <input type="hidden" name="currency" value={currency} />
                  <select name="categoryId" required defaultValue="">
                    <option value="" disabled>
                      Asignar categoría
                    </option>
                    {activeCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <button className="primary-button">Asignar</button>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
