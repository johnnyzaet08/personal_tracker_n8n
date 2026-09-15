import type { PaginatedResponse } from '@tracker/contracts';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { apiGet } from '@/lib/api';
import { currentPeriodInCostaRica, todayInCostaRica } from '@/lib/date';
import type { CategoryRecord, RecurringRecord } from '@/lib/types';
import {
  createCategory,
  createRecurring,
  materializeCurrent,
  payObligation,
  updateRecurring,
} from './actions';

export const dynamic = 'force-dynamic';

type Obligation = {
  id: string;
  period: string;
  expectedAmount: string;
  actualAmount: string | null;
  currency: string;
  dueAt: string;
  paymentStatus: string;
  reconciliationStatus: string;
  recurringPayment: { name: string };
  category: { name: string } | null;
};
export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    currency?: string;
    synced?: string;
    created?: string;
    updated?: string;
    unchanged?: string;
    skipped?: string;
  }>;
}) {
  const search = await searchParams;
  const period = search.period ?? currentPeriodInCostaRica();
  const currency = (search.currency ?? 'CRC').toUpperCase();
  const localToday = todayInCostaRica();
  const localDay = Number(localToday.slice(8, 10));
  const [response, categories, obligations] = await Promise.all([
    apiGet<PaginatedResponse<RecurringRecord>>('/api/v1/recurring-payments?pageSize=100'),
    apiGet<PaginatedResponse<CategoryRecord>>('/api/v1/categories?pageSize=100'),
    apiGet<Obligation[]>(`/api/v1/recurring-obligations?period=${period}`),
  ]);
  const activeExpenseCategories = categories.data.filter(
    (item) => item.status === 'active' && item.type === 'expense',
  );
  return (
    <>
      <PageHeader
        title="Recurrentes"
        description="Compromisos previstos separados de gastos efectivos y conciliación bancaria."
        actions={
          <form className="period-selector">
            <input name="period" type="month" defaultValue={period} />
            <input name="currency" type="hidden" value={currency} />
            <button className="primary-button">Ver</button>
          </form>
        }
      />
      <section className="panel form-panel">
        <div className="panel-heading">
          <div>
            <h2>Programar obligación mensual</h2>
            <p>Crear un patrón no registra un débito bancario.</p>
          </div>
        </div>
        {activeExpenseCategories.length === 0 ? (
          <form action={createCategory} className="inline-form">
            <input type="hidden" name="period" value={period} />
            <input type="hidden" name="currency" value={currency} />
            <label>
              Categoría mínima
              <input name="categoryName" required placeholder="Ej. Servicios" />
            </label>
            <button className="primary-button">Crear categoría</button>
          </form>
        ) : (
          <form action={createRecurring} className="form-grid">
            <input type="hidden" name="period" value={period} />
            <input type="hidden" name="filterCurrency" value={currency} />
            <label>
              Nombre
              <input name="name" required />
            </label>
            <label>
              Alias de conciliación
              <input name="aliases" placeholder="Comercio en estado de cuenta" />
            </label>
            <label>
              Monto esperado
              <input name="expectedAmount" inputMode="decimal" required />
            </label>
            <label>
              Moneda
              <input name="currency" defaultValue={currency} pattern="[A-Z]{3}" required />
            </label>
            <label>
              Categoría
              <select name="categoryId" required defaultValue="">
                <option value="" disabled>
                  Selecciona
                </option>
                {activeExpenseCategories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Inicio
              <input name="startAt" type="date" defaultValue={localToday} required />
            </label>
            <label>
              Día de vencimiento
              <input
                name="dueDay"
                type="number"
                min="1"
                max="31"
                defaultValue={localDay}
                required
              />
            </label>
            <button className="primary-button">Agregar recurrente</button>
          </form>
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Obligaciones de {period}</h2>
            <p>Las pendientes son reservas previstas, no gasto confirmado.</p>
          </div>
          <form action={materializeCurrent}>
            <input type="hidden" name="period" value={period} />
            <input type="hidden" name="currency" value={currency} />
            <button className="primary-button">Sincronizar mes</button>
          </form>
        </div>
        {search.synced === '1' && (
          <p className="sync-result" role="status">
            Mes sincronizado sin duplicados: {search.created ?? '0'} creadas,{' '}
            {search.updated ?? '0'} actualizadas y {search.unchanged ?? '0'} sin cambios.{' '}
            {search.skipped ?? '0'} obligaciones pagadas o conciliadas quedaron protegidas.
          </p>
        )}
        {obligations.length === 0 ? (
          <EmptyState
            title="Aún no hay obligaciones en este mes"
            description="Sincroniza el mes para crear obligaciones faltantes y actualizar pendientes sin duplicarlas."
          />
        ) : (
          <div className="card-list">
            {obligations.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{item.recurringPayment.name}</strong>
                  <small>
                    {item.category?.name ?? 'Sin categoría'} · vence {item.dueAt.slice(0, 10)} ·{' '}
                    {item.reconciliationStatus}
                  </small>
                </div>
                <div className="card-end">
                  <strong>
                    {item.actualAmount ?? item.expectedAmount} {item.currency}
                  </strong>
                  {item.paymentStatus === 'pending' && (
                    <form action={payObligation} className="pay-form">
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="period" value={period} />
                      <input type="hidden" name="currency" value={currency} />
                      <input
                        name="actualAmount"
                        defaultValue={item.expectedAmount}
                        inputMode="decimal"
                        aria-label="Importe real"
                        required
                      />
                      <input
                        name="paidAt"
                        type="date"
                        defaultValue={localToday}
                        max={localToday}
                        aria-label="Fecha efectiva"
                        required
                      />
                      <button className="primary-button">Registrar pago</button>
                    </form>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
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
          <div className="recurring-editor-list">
            {response.data.map((item) => (
              <details className="recurring-editor" key={item.id}>
                <summary>
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {item.category?.name ?? 'Sin categoría'} ·{' '}
                      {item.status === 'paused' ? 'Pausado' : 'Activo'} · día {item.dueDay ?? '—'}
                    </small>
                  </span>
                  <span className="recurring-summary-amount">
                    <strong>
                      {item.expectedAmount ?? '—'} {item.currency}
                    </strong>
                    <small>Editar</small>
                  </span>
                </summary>
                <div className="recurring-reference-note">
                  Cuenta: {item.account?.alias ?? 'Sin cuenta vinculada'} · Comercio:{' '}
                  {item.merchant?.displayName ?? 'Sin comercio vinculado'}
                </div>
                <form action={updateRecurring} className="recurring-edit-form">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="period" value={period} />
                  <input type="hidden" name="filterCurrency" value={currency} />
                  <label>
                    Nombre
                    <input name="name" defaultValue={item.name} required />
                  </label>
                  <label>
                    Alias de conciliación
                    <input
                      name="aliases"
                      defaultValue={Array.isArray(item.aliases) ? item.aliases.join(', ') : ''}
                      placeholder="Separados por coma"
                    />
                  </label>
                  <label>
                    Monto esperado
                    <input
                      name="expectedAmount"
                      inputMode="decimal"
                      defaultValue={item.expectedAmount ?? ''}
                      required
                    />
                  </label>
                  <label>
                    Moneda
                    <input
                      name="currency"
                      pattern="[A-Z]{3}"
                      defaultValue={item.currency}
                      required
                    />
                  </label>
                  <label>
                    Categoría
                    <select name="categoryId" defaultValue={item.category?.id ?? ''} required>
                      <option value="" disabled>
                        Selecciona
                      </option>
                      {activeExpenseCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Día de vencimiento
                    <input
                      name="dueDay"
                      type="number"
                      min="1"
                      max="31"
                      defaultValue={item.dueDay ?? localDay}
                      required
                    />
                  </label>
                  <label>
                    Estado
                    <select name="status" defaultValue={item.status}>
                      <option value="active">Activo</option>
                      <option value="paused">Pausado</option>
                    </select>
                  </label>
                  <button className="primary-button">Guardar cambios</button>
                </form>
              </details>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
