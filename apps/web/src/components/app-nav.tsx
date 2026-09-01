'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { dashboardModules } from '@/lib/modules';

export function AppNav({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const visible = compact ? dashboardModules.slice(0, 5) : dashboardModules;
  return (
    <div className={compact ? 'nav-list compact-nav' : 'nav-list'}>
      {visible
        .filter((module) => module.enabled)
        .map((module) => {
          const active = module.href === '/' ? pathname === '/' : pathname.startsWith(module.href);
          const Icon = module.icon;
          return (
            <Link
              key={module.id}
              href={module.href}
              className={active ? 'nav-link active' : 'nav-link'}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              <span>{compact && module.id === 'review' ? 'Alertas' : module.label}</span>
            </Link>
          );
        })}
    </div>
  );
}
