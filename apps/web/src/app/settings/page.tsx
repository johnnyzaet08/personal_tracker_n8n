import { PageHeader } from '@/components/page-header';
import { reservedModules } from '@/lib/modules';

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Configuración"
        description="Parámetros visibles del entorno local y extensiones planificadas."
      />
      <section className="settings-grid">
        <article className="panel">
          <h2>Contexto local</h2>
          <dl className="settings-list">
            <div>
              <dt>Zona horaria</dt>
              <dd>America/Costa_Rica</dd>
            </div>
            <div>
              <dt>Moneda predeterminada</dt>
              <dd>CRC</dd>
            </div>
            <div>
              <dt>Autenticación</dt>
              <dd>Tenant de desarrollo explícito</dd>
            </div>
          </dl>
          <p className="notice">
            Este comportamiento local no sustituye autenticación ni autorización multiusuario en
            producción.
          </p>
        </article>
        <article className="panel">
          <h2>Módulos reservados</h2>
          <p>
            El registro de navegación puede extenderse sin acoplar nuevos dominios al módulo
            financiero.
          </p>
          <ul className="reserved-list">
            {reservedModules.map((module) => (
              <li key={module}>
                {module}
                <span>Próximamente</span>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </>
  );
}
