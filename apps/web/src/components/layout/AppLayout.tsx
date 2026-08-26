import { useState } from 'react';
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
  Activity,
  Network,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MaintenanceModal } from '../common/MaintenanceModal';

const navItems = [
  { to: '/', label: 'Command Center', icon: LayoutDashboard, exact: true },
  { to: '/estate', label: 'Estate Topology', icon: Network },
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen overflow-hidden" style={{ background: 'hsl(var(--bg-app))' }}>
      {/* ── Mobile Header ── */}
      <header
        className="flex md:hidden items-center justify-between px-4 py-3 border-b flex-none z-30"
        style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
      >
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
            <div className="text-[10px]" style={{ color: 'hsl(var(--text-tertiary))' }}>
              AI Operations
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          className="p-2 rounded-lg border transition-colors hover:opacity-80"
          style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--text-primary))' }}
          aria-label="Toggle Navigation Menu"
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* ── Mobile Navigation Drawer Overlay ── */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col pt-14 fade-in" style={{ background: 'hsl(var(--bg-surface))' }}>
          <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm transition-all duration-150',
                    isActive ? 'font-medium' : 'hover:opacity-80',
                  )
                }
                style={({ isActive }) => ({
                  background: isActive ? 'hsl(220 90% 56% / 0.15)' : 'transparent',
                  color: isActive ? 'hsl(220 90% 70%)' : 'hsl(var(--text-secondary))',
                })}
              >
                <item.icon size={18} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="p-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center gap-2">
              <span className="pulse-dot" style={{ background: 'hsl(var(--color-healthy))' }} />
              <span className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>
                Simulation Mode · v0.1.0
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Desktop Sidebar ── */}
      <aside
        className="hidden md:flex w-56 flex-none flex-col border-r"
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
                  isActive ? 'font-medium' : 'hover:opacity-80',
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
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 md:p-6 overflow-x-hidden">
          <Outlet />
        </div>
      </main>

      {/* ── Blocking Maintenance Modal ── */}
      <MaintenanceModal />
    </div>
  );
}
