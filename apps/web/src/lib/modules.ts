import {
  BellRing,
  CreditCard,
  FolderTree,
  LayoutDashboard,
  Link2,
  Repeat2,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface DashboardModule {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  enabled: boolean;
}

export const dashboardModules: DashboardModule[] = [
  { id: 'summary', label: 'Resumen', href: '/', icon: LayoutDashboard, enabled: true },
  {
    id: 'transactions',
    label: 'Movimientos',
    href: '/transactions',
    icon: CreditCard,
    enabled: true,
  },
  { id: 'categories', label: 'Plan mensual', href: '/categories', icon: FolderTree, enabled: true },
  { id: 'recurring', label: 'Recurrentes', href: '/recurring', icon: Repeat2, enabled: true },
  { id: 'review', label: 'Alertas y revisión', href: '/review', icon: BellRing, enabled: true },
  { id: 'integrations', label: 'Integraciones', href: '/integrations', icon: Link2, enabled: true },
  { id: 'settings', label: 'Configuración', href: '/settings', icon: Settings, enabled: true },
];

export const reservedModules = ['Hábitos', 'Salud', 'Garmin'];
