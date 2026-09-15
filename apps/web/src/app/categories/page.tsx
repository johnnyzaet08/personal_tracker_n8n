import type { BudgetSummary } from '@tracker/contracts';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { apiGet } from '@/lib/api';
import { currentPeriodInCostaRica } from '@/lib/date';
import type { CategoryRecord } from '@/lib/types';
import { createCategory, saveBudget, updateCategory } from './actions';

export const dynamic = 'force-dynamic';

type Planning = {
  period: string;
  currency: string;
  budget: BudgetSummary | null;
  categories: CategoryRecord[];
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

function budgetDonut(assignedValue: string, committedValue: string) {
  const assigned = Number(assignedValue);
  const committed = Number(committedValue);
  if (assigned <= 0)
    return { fill: committed > 0 ? 100 : 0, label: 'Sin límite', tone: 'unbounded' };
  const used = (committed / assigned) * 100;
  if (used > 100)
    return { fill: 100, label: `${(used - 100).toFixed(0)}% excedido`, tone: 'exceeded' };
  return {
    fill: Math.max(0, used),
    label: `${Math.max(0, 100 - used).toFixed(0)}% libre`,
    tone: 'normal',
  };
}

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
        description="Presupuesto, categorías y consumo planificado para un mes y moneda."
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
        <section className="budget-grid" aria-label="Overview del presupuesto">
          {planning.budget.groups.map((group) => {
            const visual = budgetDonut(group.assigned, group.committed);
            return (
              <article className="budget-card budget-donut-card" key={group.key}>
                <div
                  className={`donut budget-donut donut-${visual.tone}`}
                  {...(visual.tone === 'unbounded'
                    ? { role: 'img', 'aria-label': `${group.label}: sin límite configurado` }
                    : {
                        role: 'progressbar',
                        'aria-label': `${group.label}: ${visual.fill.toFixed(0)}% comprometido, ${visual.label}`,
                        'aria-valuemin': 0,
                        'aria-valuemax': 100,
                        'aria-valuenow': visual.fill,
                      })}
                  style={{
                    background: `conic-gradient(${visual.tone === 'exceeded' ? 'var(--red)' : colors[groups.findIndex(([key]) => key === group.key)]} 0 ${visual.fill}%, var(--surface-soft) ${visual.fill}% 100%)`,
                  }}
                >
                  <span>{visual.label}</span>
                </div>
                <div className="budget-donut-copy">
                  <strong>{group.label}</strong>
                  <small>
                    {Number(group.percentage).toFixed(2)}% · {money(group.assigned, currency)}{' '}
                    asignado
                  </small>
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

      <section className="panel categories-panel">
        <div className="panel-heading">
          <div>
            <h2>Categorías disponibles</h2>
            <p>{planning.categories.length} categorías · gasto efectivo del mes</p>
          </div>
        </div>
        {planning.categories.length === 0 ? (
          <EmptyState title="No hay categorías" description="Crea la primera categoría debajo." />
        ) : (
          <div className="category-management-grid">
            {planning.categories.map((item) => (
              <details className="category-editor" key={item.id}>
                <summary>
                  <span
                    className="category-swatch"
                    style={{ background: item.color ?? '#d6ddd7' }}
                  />
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {groups.find(([key]) => key === item.budgetGroup)?.[1] ?? 'Grupo pendiente'} ·{' '}
                      {money(item.spent ?? '0', currency)}
                    </small>
                  </span>
                  <span className="edit-label">Editar</span>
                </summary>
                <form action={updateCategory} className="category-edit-form">
                  <input type="hidden" name="categoryId" value={item.id} />
                  <input type="hidden" name="period" value={period} />
                  <input type="hidden" name="currency" value={currency} />
                  <label>
                    Nombre
                    <input name="name" defaultValue={item.name} required />
                  </label>
                  <label>
                    Tipo
                    <select name="type" defaultValue={item.type}>
                      <option value="expense">Gasto</option>
                      <option value="income">Ingreso</option>
                    </select>
                  </label>
                  <label>
                    Grupo
                    <select name="budgetGroup" defaultValue={item.budgetGroup ?? 'needs'}>
                      {groups.map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Color
                    <input name="color" type="color" defaultValue={item.color ?? '#236b4f'} />
                  </label>
                  <button className="primary-button">Guardar cambios</button>
                </form>
              </details>
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
      </section>
    </>
  );
}
