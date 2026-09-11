import type { BudgetSummary } from '@tracker/contracts';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { apiGet } from '@/lib/api';
import { currentPeriodInCostaRica } from '@/lib/date';
import type { CategoryRecord } from '@/lib/types';
import { assignCategory, createCategory, saveBudget } from './actions';

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
const groups = [
  ['savings', 'Ahorro'],
  ['needs', 'Gastos necesarios'],
  ['provisions', 'Provisiones'],
  ['play', 'Monto de play'],
] as const;
const colors = ['#236b4f', '#b45545', '#bf7a28', '#4b6f8f'];
const money = (value: string, currency: string) =>
  new Intl.NumberFormat('es-CR', { style: 'currency', currency }).format(Number(value));

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; currency?: string }>;
}) {
  const search = await searchParams;
  const period = search.period ?? currentPeriodInCostaRica();
  const currency = (search.currency ?? 'CRC').toUpperCase();
  const planning = await apiGet<Planning>(
    `/api/v1/planning/summary?period=${period}&currency=${currency}`,
  );
  const allocations = Object.fromEntries(
    planning.budget?.groups.map((group) => [group.key, Number(group.percentage)]) ?? [],
  );
  return (
    <>
      <PageHeader
        title="Plan mensual"
        description="Presupuesto, categorías y gastos pendientes de clasificación para un mes y moneda."
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

      <section className="panel form-panel">
        <div className="panel-heading">
          <div>
            <h2>Presupuesto de {period}</h2>
            <p>
              Los cuatro grupos provienen del template. Los porcentajes son editables y deben sumar
              100%.
            </p>
          </div>
        </div>
        <form action={saveBudget} className="budget-form">
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="currency" value={currency} />
          <label>
            Ingreso base
            <input
              name="incomeBase"
              inputMode="decimal"
              defaultValue={planning.budget?.incomeBase ?? ''}
              placeholder="0.00"
              required
            />
          </label>
          {groups.map(([key, label]) => (
            <label key={key}>
              {label} %
              <input
                name={key}
                type="number"
                min="0"
                max="100"
                step="0.01"
                defaultValue={allocations[key] ?? ''}
                required
              />
            </label>
          ))}
          <button className="primary-button">Guardar presupuesto</button>
        </form>
      </section>

      {planning.budget && (
        <section className="budget-grid" aria-label="Resumen del presupuesto">
          {planning.budget.groups.map((group) => {
            const usedRatio =
              Number(group.assigned) > 0
                ? Math.min(100, (Number(group.committed) / Number(group.assigned)) * 100)
                : 0;
            return (
              <article className="budget-card" key={group.key}>
                <span
                  className="category-swatch"
                  style={{ background: colors[groups.findIndex(([key]) => key === group.key)] }}
                />
                <div>
                  <strong>{group.label}</strong>
                  <small>
                    {Number(group.percentage).toFixed(2)}% · {money(group.assigned, currency)}{' '}
                    asignado
                  </small>
                </div>
                <div className="budget-progress">
                  <span style={{ width: `${usedRatio}%` }} />
                </div>
                <dl>
                  <div>
                    <dt>Utilizado</dt>
                    <dd>{money(group.used, currency)}</dd>
                  </div>
                  <div>
                    <dt>Recurrentes pendientes</dt>
                    <dd>{money(group.recurringPending, currency)}</dd>
                  </div>
                  <div>
                    <dt>Disponible</dt>
                    <dd className={Number(group.available) < 0 ? 'negative' : ''}>
                      {money(group.available, currency)}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </section>
      )}

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Categorías disponibles</h2>
              <p>{planning.categories.length} categorías · gasto efectivo del mes</p>
            </div>
          </div>
          {planning.categories.length === 0 ? (
            <EmptyState title="No hay categorías" description="Crea la primera categoría debajo." />
          ) : (
            <div className="card-list">
              {planning.categories.map((item) => (
                <article key={item.id}>
                  <span
                    className="category-swatch"
                    style={{ background: item.color ?? '#d6ddd7' }}
                  />
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {groups.find(([key]) => key === item.budgetGroup)?.[1] ?? 'Grupo pendiente'} ·{' '}
                      {money(item.spent ?? '0', currency)}
                    </small>
                  </div>
                </article>
              ))}
            </div>
          )}
          <form action={createCategory} className="category-create">
            <input type="hidden" name="period" value={period} />
            <input type="hidden" name="currency" value={currency} />
            <label>
              Nombre
              <input name="name" required />
            </label>
            <label>
              Grupo
              <select name="budgetGroup" defaultValue="needs">
                {groups.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Color
              <input name="color" type="color" defaultValue="#236b4f" />
            </label>
            <button className="primary-button">Agregar categoría</button>
          </form>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Sin categoría</h2>
              <p>Estos gastos no participan en un grupo hasta que los asignes.</p>
            </div>
          </div>
          {planning.uncategorized.length === 0 ? (
            <EmptyState
              title="Todo está clasificado"
              description="No hay gastos confirmados pendientes de categoría en este período."
            />
          ) : (
            <div className="card-list">
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
                      {planning.categories
                        .filter((category) => category.status === 'active')
                        .map((category) => (
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
        </article>
      </section>
    </>
  );
}
