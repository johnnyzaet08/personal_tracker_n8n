import type { DashboardSummary } from '@tracker/contracts';
import { ArrowDownLeft, ArrowUpRight, Scale, ShieldAlert } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusPill } from '@/components/status-pill';
import { apiGet } from '@/lib/api';
import { currentPeriodInCostaRica } from '@/lib/date';

export const dynamic = 'force-dynamic';

function money(value: string, currency: string): string {
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency }).format(Number(value));
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; currency?: string }>;
}) {
  const search = await searchParams;
  const period = search.period ?? currentPeriodInCostaRica();
  const currency = (search.currency ?? 'CRC').toUpperCase();
  const [year, month] = period.split('-').map(Number);
  const from = new Date(Date.UTC(year!, month! - 1, 1, 6)).toISOString();
  const to = new Date(Date.UTC(year!, month!, 1, 5, 59, 59, 999)).toISOString();
  const summary = await apiGet<DashboardSummary>(
    `/api/v1/dashboard/summary?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}&currency=${currency}`,
  );
  const metrics = [
    {
      label: 'Gastos del período',
      value: money(summary.expenses, currency),
      icon: ArrowUpRight,
      tone: 'expense',
    },
    {
      label: 'Ingresos del período',
      value: money(summary.income, currency),
      icon: ArrowDownLeft,
      tone: 'income',
    },
    { label: 'Balance', value: money(summary.balance, currency), icon: Scale, tone: 'balance' },
    {
      label: 'Pendientes de revisión',
      value: String(summary.pendingReview),
      icon: ShieldAlert,
      tone: 'review',
    },
  ];
  return (
    <>
      <PageHeader
        title="Resumen"
        description="Una lectura clara de tu actividad financiera del período actual."
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
      <section className="metric-grid" aria-label="Indicadores principales">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article className={`metric-card metric-${metric.tone}`} key={metric.label}>
              <div className="metric-label">
                <span className="metric-icon">
                  <Icon size={18} aria-hidden="true" />
                </span>
                {metric.label}
              </div>
              <strong>{metric.value}</strong>
              <span className="metric-note">Datos confirmados por la API</span>
            </article>
          );
        })}
      </section>
      <section className="dashboard-grid">
        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <h2>Uso por grupo presupuestario</h2>
              <p>
                El círculo muestra lo comprometido y lo que queda antes del límite. Recurrentes
                pendientes solo reservan en Gastos necesarios.
              </p>
            </div>
          </div>
          {!summary.budget ? (
            <EmptyState
              title="Presupuesto sin configurar"
              description="Configúralo en Plan mensual para comparar gastos y compromisos contra límites."
            />
          ) : (
            <div className="donut-grid">
              {summary.budget.groups.map((group) => {
                const ratio =
                  Number(group.assigned) > 0
                    ? Math.max(
                        0,
                        Math.min(100, (Number(group.committed) / Number(group.assigned)) * 100),
                      )
                    : 0;
                return (
                  <article key={group.key} className="donut-item">
                    <div
                      className="donut"
                      style={{
                        background: `conic-gradient(var(--forest-bright) 0 ${ratio}%, var(--surface-soft) ${ratio}% 100%)`,
                      }}
                    >
                      <span>{ratio.toFixed(0)}%</span>
                    </div>
                    <strong>{group.label}</strong>
                    <small>{money(group.committed, currency)} comprometido</small>
                    <small>{money(group.available, currency)} disponible</small>
                  </article>
                );
              })}
            </div>
          )}
        </article>
        <article className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <h2>Evolución temporal</h2>
              <p>Débitos e ingresos confirmados</p>
            </div>
          </div>
          {summary.timeline.length === 0 ? (
            <EmptyState
              title="Aún no hay movimientos"
              description="La evolución aparecerá cuando la API reciba transacciones válidas."
            />
          ) : (
            <div className="timeline-bars">
              {summary.timeline.map((point) => (
                <div key={point.date} className="timeline-day">
                  <span style={{ height: `${Math.min(100, Number(point.debit))}%` }} />
                  <small>{point.date.slice(5)}</small>
                </div>
              ))}
            </div>
          )}
        </article>
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Por categoría</h2>
              <p>Distribución de gastos</p>
            </div>
          </div>
          {summary.byCategory.length === 0 ? (
            <EmptyState
              title="Sin categorías con actividad"
              description="No se han registrado gastos categorizados."
            />
          ) : (
            <ul className="rank-list">
              {summary.byCategory.map((item) => (
                <li key={item.categoryId ?? item.name}>
                  <span>{item.name}</span>
                  <strong>{money(item.amount, currency)}</strong>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Comercios principales</h2>
              <p>Mayor gasto del período</p>
            </div>
          </div>
          {summary.topMerchants.length === 0 ? (
            <EmptyState
              title="Sin comercios registrados"
              description="Los comercios se mostrarán al procesar movimientos."
            />
          ) : (
            <ul className="rank-list">
              {summary.topMerchants.map((item) => (
                <li key={item.merchantId ?? item.name}>
                  <span>{item.name}</span>
                  <strong>{money(item.amount, currency)}</strong>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="panel">
          <div className="panel-heading">
            <div>
              <h2>Integraciones</h2>
              <p>Estado de fuentes configuradas</p>
            </div>
          </div>
          {summary.integrations.length === 0 ? (
            <EmptyState
              title="Sin integraciones"
              description="Configura una fuente para comenzar."
            />
          ) : (
            <ul className="integration-list">
              {summary.integrations.map((item) => (
                <li key={item.provider}>
                  <span className="provider-avatar">{item.provider.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <strong>{item.provider}</strong>
                    <small>
                      {item.lastSyncAt
                        ? `Última sincronización ${new Date(item.lastSyncAt).toLocaleString('es-CR')}`
                        : 'Sin sincronizaciones'}
                    </small>
                  </div>
                  <StatusPill status={item.status} />
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </>
  );
}
