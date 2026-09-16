import React, { useState, useRef } from 'react';
import { useAuth, Role } from '@/context/AuthContext';
import { Shield, Key, User, LogIn, Lock, Activity, Volume2 } from 'lucide-react';

export function LoginLanding() {
  const { login, isLoggingIn, loginError, switchRole } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hasEntered, setHasEntered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleEnter = () => {
    if (!hasEntered) {
      setHasEntered(true);
      if (videoRef.current) {
        videoRef.current.muted = false;
        videoRef.current.play().catch(() => {});
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(username, password);
  };

  const handleQuickLogin = async (role: Role) => {
    await switchRole(role);
  };

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-slate-950 flex items-center justify-center select-none"
      onClick={handleEnter}
    >
      {/* ── Background Video ── */}
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover z-0"
      >
        <source src="/login-background.mp4" type="video/mp4" />
      </video>

      {/* ── Video Vignette & Dark Overlay ── */}
      <div className="absolute inset-0 z-10 bg-slate-950/40 backdrop-brightness-90 pointer-events-none" />

      {/* ── First-Visit "Click Anywhere to Enter" Overlay ── */}
      {!hasEntered && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm cursor-pointer transition-all duration-500 fade-in">
          <div className="flex flex-col items-center gap-4 text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-600/90 flex items-center justify-center shadow-lg shadow-blue-500/30 animate-pulse">
              <Activity className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">OpsPilot AI Platform</h1>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/80 border border-slate-700/80 text-blue-400 text-sm font-medium shadow-md animate-bounce">
              <Volume2 size={16} />
              <span>Click anywhere to enter with audio</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Glassmorphism Login Card ── */}
      <div className="relative z-20 w-full max-w-md mx-4 rounded-2xl border border-slate-700/60 bg-slate-900/80 backdrop-blur-xl p-6 md:p-8 shadow-2xl text-slate-100 space-y-6">
        {/* Branding Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center shadow-md">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">OpsPilot AI</h2>
            <p className="text-xs text-slate-400">Autonomous Operations Command Platform</p>
          </div>
        </div>

        {/* Error Banner */}
        {loginError && (
          <div className="p-3 rounded-lg border bg-rose-500/10 border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <Lock size={14} />
            <span>{loginError}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Username</label>
            <div className="relative">
              <User className="absolute left-3.5 top-2.5 size-4 text-slate-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full pl-10 pr-3 py-2 rounded-xl text-xs bg-slate-950/70 border border-slate-700 text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Password</label>
            <div className="relative">
              <Key className="absolute left-3.5 top-2.5 size-4 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full pl-10 pr-3 py-2 rounded-xl text-xs bg-slate-950/70 border border-slate-700 text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs text-white bg-blue-600 hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/30 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <LogIn size={15} />
            {isLoggingIn ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        {/* Quick Demo Login Role Buttons */}
        <div className="pt-4 border-t border-slate-800 space-y-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Quick Demo Login (Seeded RBAC Roles)
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin('VIEWER')}
              className="p-2.5 text-left rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/60 transition-all flex flex-col"
            >
              <span className="font-semibold text-xs text-blue-400">🔵 Viewer</span>
              <span className="text-[10px] text-slate-400">Read-Only</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('SRE_OPERATOR')}
              className="p-2.5 text-left rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/60 transition-all flex flex-col"
            >
              <span className="font-semibold text-xs text-emerald-400">🟢 SRE Operator</span>
              <span className="text-[10px] text-slate-400">Rules & Approve</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('INCIDENT_COMMANDER')}
              className="p-2.5 text-left rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/60 transition-all flex flex-col"
            >
              <span className="font-semibold text-xs text-rose-400">🔴 Commander</span>
              <span className="text-[10px] text-slate-400">Remediation & Chaos</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('SECURITY_ADMIN')}
              className="p-2.5 text-left rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/60 transition-all flex flex-col"
            >
              <span className="font-semibold text-xs text-purple-400">🟣 Security Admin</span>
              <span className="text-[10px] text-slate-400">Telemetry & Admin</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
