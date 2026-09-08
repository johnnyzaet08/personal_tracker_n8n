import type { PaginatedResponse } from '@tracker/contracts';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { apiGet } from '@/lib/api';
import { currentPeriodInCostaRica, todayInCostaRica } from '@/lib/date';
import type { CategoryRecord, RecurringRecord } from '@/lib/types';
import { createCategory, createRecurring, materializeCurrent, payObligation } from './actions';

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
  searchParams: Promise<{ period?: string }>;
}) {
  const period = (await searchParams).period ?? currentPeriodInCostaRica();
  const localToday = todayInCostaRica();
  const localDay = Number(localToday.slice(8, 10));
  const [response, categories, obligations] = await Promise.all([
    apiGet<PaginatedResponse<RecurringRecord>>('/api/v1/recurring-payments?pageSize=100'),
    apiGet<PaginatedResponse<CategoryRecord>>('/api/v1/categories?pageSize=100'),
    apiGet<Obligation[]>(`/api/v1/recurring-obligations?period=${period}`),
  ]);
  return (
    <>
      <PageHeader
        title="Recurrentes"
        description="Compromisos previstos separados de gastos efectivos y conciliación bancaria."
      />
      <section className="panel form-panel">
        <div className="panel-heading">
          <div>
            <h2>Programar obligación mensual</h2>
            <p>Crear un patrón no registra un débito bancario.</p>
          </div>
        </div>
        {categories.data.length === 0 ? (
          <form action={createCategory} className="inline-form">
            <label>
              Categoría mínima
              <input name="categoryName" required placeholder="Ej. Servicios" />
            </label>
            <button className="primary-button">Crear categoría</button>
          </form>
        ) : (
          <form action={createRecurring} className="form-grid">
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
              <input name="currency" defaultValue="CRC" pattern="[A-Z]{3}" required />
            </label>
            <label>
              Categoría
              <select name="categoryId" required defaultValue="">
                <option value="" disabled>
                  Selecciona
                </option>
                {categories.data
                  .filter((item) => item.status === 'active')
                  .map((item) => (
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
            <button className="primary-button">Generar mes</button>
          </form>
        </div>
        {obligations.length === 0 ? (
          <EmptyState
            title="Aún no hay obligaciones en este mes"
            description="Genera el mes para materializar patrones activos; la operación es idempotente."
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
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
