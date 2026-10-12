import type { BudgetSummary } from '@tracker/contracts';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { EmailFeedback } from '@/components/email-feedback';
import { EmailSyncWorkspace } from '@/components/email-sync-workspace';
import { loadEmailSourceOptions, loadSyncSources } from '@/app/integrations/email-actions';
import { apiGet } from '@/lib/api';
import { currentPeriodInCostaRica } from '@/lib/date';
import type { CategoryRecord } from '@/lib/types';
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
  searchParams: Promise<{ period?: string; currency?: string; sourceId?: string }>;
}) {
  const search = await searchParams;
  const period = search.period ?? currentPeriodInCostaRica();
  const currency = (search.currency ?? 'CRC').toUpperCase();
  const [planning, sources, sourceOptions] = await Promise.all([
    apiGet<Planning>(`/api/v1/planning/summary?period=${period}&currency=${currency}`),
    loadSyncSources(),
    loadEmailSourceOptions(),
  ]);
  const activeCategories = planning.categories.filter(
    (category) => category.status === 'active' && category.type === 'expense',
  );

  return (
    <>
      <PageHeader
        title="Revisión"
        description="Gastos pendientes de categoría y sincronización de correo."
        actions={
          <form className="period-selector">
            {search.sourceId ? (
              <input type="hidden" name="sourceId" value={search.sourceId} />
            ) : null}
            <input name="period" type="month" defaultValue={period} />
            <select name="currency" defaultValue={currency}>
              <option>CRC</option>
              <option>USD</option>
            </select>
            <button className="primary-button">Ver</button>
          </form>
        }
      />
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
                  {search.sourceId ? (
                    <input type="hidden" name="sourceId" value={search.sourceId} />
                  ) : null}
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
      {sources.ok && sourceOptions.ok ? (
        <EmailSyncWorkspace
          initialSources={sources.data}
          options={sourceOptions.data}
          {...(search.sourceId ? { requestedSourceId: search.sourceId } : {})}
        />
      ) : (
        <section className="panel">
          <h2>Sincronización de una fuente</h2>
          <EmailFeedback error={!sources.ok ? sources : !sourceOptions.ok ? sourceOptions : null} />
          <p>Recarga la página para volver a consultar las fuentes.</p>
        </section>
      )}
    </>
  );
}
