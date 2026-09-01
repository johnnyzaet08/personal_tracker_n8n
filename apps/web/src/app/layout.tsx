import type { Metadata } from 'next';
import { AppNav } from '@/components/app-nav';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Nexo Finanzas', template: '%s · Nexo Finanzas' },
  description: 'Seguimiento financiero personal con automatizaciones verificables.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es">
      <body>
        <div className="app-shell">
          <aside className="sidebar">
            <div className="brand-block">
              <span className="brand-mark" aria-hidden="true">
                N
              </span>
              <div>
                <strong>Nexo</strong>
                <span>Finanzas personales</span>
              </div>
            </div>
            <AppNav />
            <div className="local-badge">
              <span className="status-dot" aria-hidden="true" />
              Entorno local
            </div>
          </aside>
          <div className="main-column">
            <header className="mobile-header">
              <div className="brand-block compact">
                <span className="brand-mark" aria-hidden="true">
                  N
                </span>
                <strong>Nexo</strong>
              </div>
            </header>
            <main id="main-content" className="content">
              {children}
            </main>
            <nav className="mobile-nav" aria-label="Navegación móvil">
              <AppNav compact />
            </nav>
          </div>
        </div>
      </body>
    </html>
  );
}
