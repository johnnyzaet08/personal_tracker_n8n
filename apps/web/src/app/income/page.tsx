import type { MonthlyIncomeSummary } from '@tracker/contracts';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { apiGet } from '@/lib/api';
import { currentPeriodInCostaRica, todayInCostaRica } from '@/lib/date';
import { createMonthlyIncome } from './actions';

export const dynamic = 'force-dynamic';

const money = (value: string, currency: string) =>
  new Intl.NumberFormat('es-CR', { style: 'currency', currency }).format(Number(value));

export default async function IncomePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; currency?: string; added?: string }>;
}) {
  const search = await searchParams;
  const period = search.period ?? currentPeriodInCostaRica();
  const currency = (search.currency ?? 'CRC').toUpperCase();
  const defaultDate = todayInCostaRica().startsWith(`${period}-`)
    ? todayInCostaRica()
    : `${period}-01`;
  const income = await apiGet<MonthlyIncomeSummary>(
    `/api/v1/monthly-incomes?period=${period}&currency=${currency}`,
  );

  return (
    <>
      <PageHeader
        title="Ingresos"
        description="Registra lo recibido durante el mes para actualizar los montos del plan."
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
            <h2>Agregar ingreso</h2>
            <p>
              Total registrado en {period}: {money(income.total, currency)}
            </p>
          </div>
        </div>
        {search.added === '1' && (
          <p className="sync-result" role="status">
            Ingreso registrado.
          </p>
        )}
        <form action={createMonthlyIncome} className="income-entry-form">
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="currency" value={currency} />
          <label>
            Fecha
            <input name="occurredOn" type="date" defaultValue={defaultDate} required />
          </label>
          <label>
            Descripción
            <input
              name="description"
              maxLength={255}
              placeholder="Salario, venta, servicio…"
              required
            />
          </label>
          <label>
            Monto
            <input name="amount" inputMode="decimal" placeholder="0.00" required />
          </label>
          <button className="primary-button">Registrar ingreso</button>
        </form>
      </section>

      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h2>Registro de ingresos</h2>
            <p>
              {income.records.length} ingresos · {period}
            </p>
          </div>
          <strong className="income-total">{money(income.total, currency)}</strong>
        </div>
        {income.records.length === 0 ? (
          <EmptyState
            title="Aún no hay ingresos registrados"
            description="Agrega el ingreso base del mes o registra ventas y servicios adicionales."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th className="amount">Monto</th>
                </tr>
              </thead>
              <tbody>
                {income.records.map((record) => (
                  <tr key={record.id}>
                    <td>
                      {new Intl.DateTimeFormat('es-CR', {
                        dateStyle: 'medium',
                        timeZone: 'UTC',
                      }).format(new Date(`${record.occurredOn}T12:00:00Z`))}
                    </td>
                    <td>{record.description}</td>
                    <td className="amount credit">{money(record.amount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
