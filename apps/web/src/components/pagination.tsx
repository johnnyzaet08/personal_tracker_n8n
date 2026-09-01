import Link from 'next/link';

export function Pagination({
  page,
  totalPages,
  basePath,
  query,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  query: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;
  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    params.set('page', String(target));
    return `${basePath}?${params.toString()}`;
  };
  return (
    <nav className="pagination" aria-label="Paginación">
      <Link
        aria-disabled={page <= 1}
        className={page <= 1 ? 'disabled' : ''}
        href={page <= 1 ? href(page) : href(page - 1)}
      >
        Anterior
      </Link>
      <span>
        Página {page} de {totalPages}
      </span>
      <Link
        aria-disabled={page >= totalPages}
        className={page >= totalPages ? 'disabled' : ''}
        href={page >= totalPages ? href(page) : href(page + 1)}
      >
        Siguiente
      </Link>
    </nav>
  );
}
