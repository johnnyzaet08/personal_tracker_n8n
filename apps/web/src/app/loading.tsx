export default function Loading() {
  return (
    <div className="loading-stack" aria-label="Cargando panel">
      <div className="skeleton title" />
      <div className="metric-grid">
        {[1, 2, 3, 4].map((item) => (
          <div className="skeleton metric" key={item} />
        ))}
      </div>
      <div className="skeleton chart" />
    </div>
  );
}
