import type { PaginatedResponse } from '@tracker/contracts';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { StatusPill } from '@/components/status-pill';
import { apiGet } from '@/lib/api';
import type { CategoryRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const response = await apiGet<PaginatedResponse<CategoryRecord>>(
    '/api/v1/categories?pageSize=100',
  );
  return (
    <>
      <PageHeader
        title="Categorías"
        description="Estructura jerárquica preparada para organizar ingresos y gastos."
      />
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Catálogo</h2>
            <p>{response.pagination.total} categorías configuradas</p>
          </div>
        </div>
        {response.data.length === 0 ? (
          <EmptyState
            title="Aún no hay categorías"
            description="Las categorías se administrarán aquí cuando se habilite su edición."
          />
        ) : (
          <div className="card-list">
            {response.data.map((item) => (
              <article key={item.id}>
                <span className="category-swatch" style={{ background: item.color ?? '#d6ddd7' }} />
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.type} · {item.slug}
                  </small>
                </div>
                <StatusPill status={item.status} />
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
