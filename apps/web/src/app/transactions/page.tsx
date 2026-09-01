import type { PaginatedResponse } from '@tracker/contracts';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { StatusPill } from '@/components/status-pill';
import { apiGet, queryString } from '@/lib/api';
import type { TransactionRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';
type Search = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const search = await searchParams;
  const filters = {
    page: one(search.page),
    pageSize: '25',
    dateFrom: one(search.dateFrom),
    dateTo: one(search.dateTo),
    accountId: one(search.accountId),
    categoryId: one(search.categoryId),
    merchantId: one(search.merchantId),
    currency: one(search.currency),
    status: one(search.status),
    type: one(search.type),
    requiresReview: one(search.requiresReview),
  };
  const response = await apiGet<PaginatedResponse<TransactionRecord>>(
    `/api/v1/transactions${queryString(filters)}`,
  );
  return (
    <>
      <PageHeader
        title="Movimientos"
        description="Consulta y filtra las transacciones confirmadas por la API."
      />
      <form className="filter-panel" method="get">
        <div className="filter-grid">
          <label>
            Desde
            <input type="date" name="dateFrom" defaultValue={filters.dateFrom?.slice(0, 10)} />
          </label>
          <label>
            Hasta
            <input type="date" name="dateTo" defaultValue={filters.dateTo?.slice(0, 10)} />
          </label>
          <label>
            Moneda
            <input
              name="currency"
              maxLength={3}
              placeholder="CRC"
              defaultValue={filters.currency}
            />
          </label>
          <label>
            Tipo
            <input name="type" placeholder="compra, transferencia…" defaultValue={filters.type} />
          </label>
          <label>
            Estado
            <select name="status" defaultValue={filters.status ?? ''}>
              <option value="">Todos</option>
              <option value="posted">Contabilizado</option>
              <option value="pending_review">En revisión</option>
              <option value="void">Anulado</option>
            </select>
          </label>
          <label>
            Revisión
            <select name="requiresReview" defaultValue={filters.requiresReview ?? ''}>
              <option value="">Todos</option>
              <option value="true">Requiere revisión</option>
              <option value="false">Sin revisión</option>
            </select>
          </label>
        </div>
        <details>
          <summary>Filtros avanzados</summary>
          <div className="filter-grid advanced">
            <label>
              ID de cuenta
              <input name="accountId" defaultValue={filters.accountId} />
            </label>
            <label>
              ID de categoría
              <input name="categoryId" defaultValue={filters.categoryId} />
            </label>
            <label>
              ID de comercio
              <input name="merchantId" defaultValue={filters.merchantId} />
            </label>
          </div>
        </details>
        <button type="submit" className="primary-button">
          Aplicar filtros
        </button>
      </form>
      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h2>Registro de movimientos</h2>
            <p>{response.pagination.total} resultados</p>
          </div>
        </div>
        {response.data.length === 0 ? (
          <EmptyState
            title="No hay movimientos"
            description="No existen transacciones para los filtros seleccionados. No se generan datos de ejemplo."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th>Comercio</th>
                  <th>Categoría</th>
                  <th>Estado</th>
                  <th className="amount">Monto</th>
                </tr>
              </thead>
              <tbody>
                {response.data.map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.occurredAt).toLocaleDateString('es-CR')}</td>
                    <td>
                      <strong>{item.description}</strong>
                      <small>{item.transactionType}</small>
                    </td>
                    <td>{item.merchant?.displayName ?? '—'}</td>
                    <td>{item.category?.name ?? 'Sin categoría'}</td>
                    <td>
                      <StatusPill status={item.status} />
                    </td>
                    <td className={`amount ${item.direction}`}>
                      {item.direction === 'debit' ? '−' : '+'}
                      {item.amount} {item.currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={response.pagination.page}
          totalPages={response.pagination.totalPages}
          basePath="/transactions"
          query={filters}
        />
      </section>
    </>
  );
}
