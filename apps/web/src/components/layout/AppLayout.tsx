import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  AlertTriangle,
  Bell,
  Server,
  Zap,
  BarChart3,
  ClipboardList,
  Settings as SettingsIcon,
  Sliders,
  Cpu,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', label: 'Command Center', icon: LayoutDashboard, exact: true },
  { to: '/incidents', label: 'Incidents', icon: AlertTriangle },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/rules', label: 'Threshold Rules', icon: Sliders },
  { to: '/services', label: 'Services', icon: Server },
  { to: '/chaos', label: 'Chaos Lab', icon: Zap },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/audit', label: 'Audit Log', icon: ClipboardList },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'hsl(var(--bg-app))' }}>
      {/* ── Sidebar ── */}
      <aside
        className="w-56 flex-none flex flex-col border-r"
        style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
      >
        {/* Logo */}
        <div className="px-4 py-5 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'hsl(220 90% 56%)' }}
            >
              <Activity size={14} className="text-white" />
            </div>
            <div>
              <div className="font-semibold text-sm" style={{ color: 'hsl(var(--text-primary))' }}>
                OpsPilot
              </div>
              <div className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>
                AI Operations
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all duration-150',
                  isActive
                    ? 'font-medium'
                    : 'hover:opacity-80',
                )
              }
              style={({ isActive }) => ({
                background: isActive ? 'hsl(220 90% 56% / 0.15)' : 'transparent',
                color: isActive ? 'hsl(220 90% 70%)' : 'hsl(var(--text-secondary))',
              })}
            >
              <item.icon size={15} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Version badge */}
        <div className="px-4 py-3 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="flex items-center gap-1.5">
            <span className="pulse-dot" style={{ background: 'hsl(var(--color-healthy))' }} />
            <span className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>
              Simulation Mode
            </span>
          </div>
          <div className="text-xs mt-1" style={{ color: 'hsl(var(--text-tertiary))' }}>
            Phase 1 · v0.1.0
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
