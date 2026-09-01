'use client';

import { CircleAlert, RefreshCw } from 'lucide-react';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="error-state" role="alert">
      <CircleAlert size={30} aria-hidden="true" />
      <h1>No pudimos cargar el panel</h1>
      <p>
        La API no respondió correctamente. Verifica el estado de los servicios e inténtalo otra vez.
      </p>
      <button type="button" onClick={reset}>
        <RefreshCw size={16} aria-hidden="true" />
        Reintentar
      </button>
    </section>
  );
}
