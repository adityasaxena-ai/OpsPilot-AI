import React, { useState } from 'react';
import { useAuth, DEMO_CREDENTIALS, Role } from '@/context/AuthContext';
import { Shield, Key, User, LogIn, Lock, CheckCircle2 } from 'lucide-react';

export function LoginModal({ isOpen, onClose }: { isOpen: boolean; onClose?: () => void }) {
  const { login, isLoggingIn, loginError, isAuthenticated, user, logout } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login(username, password);
    if (success && onClose) {
      onClose();
    }
  };

  const handleQuickLogin = async (role: Role) => {
    const creds = DEMO_CREDENTIALS[role];
    if (creds) {
      setUsername(creds.username);
      setPassword(creds.password);
      const success = await login(creds.username, creds.password);
      if (success && onClose) {
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm fade-in">
      <div
        className="w-full max-w-md rounded-xl border p-6 shadow-2xl relative"
        style={{
          background: 'hsl(var(--bg-surface))',
          borderColor: 'hsl(var(--border))',
          color: 'hsl(var(--text-primary))',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 pb-4 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shadow-md"
            style={{ background: 'hsl(220 90% 56%)' }}
          >
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">OpsPilot AI Authentication</h2>
            <p className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>
              Authenticate to issue JWT & authorize operations
            </p>
          </div>
        </div>

        {isAuthenticated && user ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>
                Authenticated as <strong>{user.displayName}</strong> ({user.roles.join(', ')})
              </span>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium rounded-lg border hover:opacity-80 transition-all"
                  style={{ borderColor: 'hsl(var(--border))' }}
                >
                  Close
                </button>
              )}
              <button
                type="button"
                onClick={logout}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-all"
              >
                Log Out
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {loginError && (
              <div className="p-3 rounded-lg border bg-rose-500/10 border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <Lock size={14} />
                <span>{loginError}</span>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--text-secondary))' }}>
                  Username
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 size-4 text-slate-400" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    className="w-full pl-9 pr-3 py-2 rounded-lg text-xs border outline-none transition-all focus:ring-1 focus:ring-blue-500"
                    style={{
                      background: 'hsl(var(--bg-app))',
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--text-primary))',
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'hsl(var(--text-secondary))' }}>
                  Password
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-2.5 size-4 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full pl-9 pr-3 py-2 rounded-lg text-xs border outline-none transition-all focus:ring-1 focus:ring-blue-500"
                    style={{
                      background: 'hsl(var(--bg-app))',
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--text-primary))',
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-2.5 px-4 rounded-lg font-medium text-xs text-white flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
                style={{ background: 'hsl(220 90% 56%)' }}
              >
                <LogIn size={15} />
                {isLoggingIn ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>

            {/* Quick Demo Login Accounts */}
            <div className="pt-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-2.5 text-slate-400">
                Quick Demo Login (Seeded RBAC Roles)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickLogin('VIEWER')}
                  className="p-2 text-left rounded-lg border text-xs hover:bg-slate-800/50 transition-all flex flex-col"
                  style={{ borderColor: 'hsl(var(--border))' }}
                >
                  <span className="font-semibold text-blue-400">🔵 Viewer</span>
                  <span className="text-[10px] text-slate-400">Read-Only</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin('SRE_OPERATOR')}
                  className="p-2 text-left rounded-lg border text-xs hover:bg-slate-800/50 transition-all flex flex-col"
                  style={{ borderColor: 'hsl(var(--border))' }}
                >
                  <span className="font-semibold text-emerald-400">🟢 SRE Operator</span>
                  <span className="text-[10px] text-slate-400">Rules & Approve</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin('INCIDENT_COMMANDER')}
                  className="p-2 text-left rounded-lg border text-xs hover:bg-slate-800/50 transition-all flex flex-col"
                  style={{ borderColor: 'hsl(var(--border))' }}
                >
                  <span className="font-semibold text-rose-400">🔴 Commander</span>
                  <span className="text-[10px] text-slate-400">Remediation & Chaos</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin('SECURITY_ADMIN')}
                  className="p-2 text-left rounded-lg border text-xs hover:bg-slate-800/50 transition-all flex flex-col"
                  style={{ borderColor: 'hsl(var(--border))' }}
                >
                  <span className="font-semibold text-purple-400">🟣 Security Admin</span>
                  <span className="text-[10px] text-slate-400">Telemetry & Admin</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
