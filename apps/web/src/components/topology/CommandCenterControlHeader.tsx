import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Pause,
  Play,
  Layers,
  Zap,
  Flame,
  RotateCcw,
  ChevronDown,
  ShieldAlert,
  Radio,
} from 'lucide-react';
import { EstateTopologySummary, EstateChaosScenario, CHAOS_SCENARIOS } from '@opspilot/types';

interface CommandCenterControlHeaderProps {
  summary?: EstateTopologySummary;
  isPaused: boolean;
  onTogglePause: () => void;
  filter: 'ALL' | 'GREEN' | 'AMBER' | 'RED';
  onFilterChange: (filter: 'ALL' | 'GREEN' | 'AMBER' | 'RED') => void;
  activeScenario: EstateChaosScenario | null;
  onSelectScenario: (scenario: EstateChaosScenario | null) => void;
}

export const CommandCenterControlHeader: React.FC<CommandCenterControlHeaderProps> = ({
  summary,
  isPaused,
  onTogglePause,
  filter,
  onFilterChange,
  activeScenario,
  onSelectScenario,
}) => {
  const [isScenarioDropdownOpen, setIsScenarioDropdownOpen] = useState(false);

  const total = summary?.totalComponents ?? 25;
  const green = summary?.greenCount ?? 25;
  const amber = summary?.amberCount ?? 0;
  const red = summary?.redCount ?? 0;
  const healthyPercent = total > 0 ? Math.round((green / total) * 100) : 100;

  const masterStatus =
    red > 0 ? 'CRITICAL' : amber > 0 ? 'DEGRADED' : 'HEALTHY';

  const statusBadgeStyle = {
    HEALTHY: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]',
    DEGRADED: 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.3)] animate-pulse',
    CRITICAL: 'bg-rose-500/25 text-rose-300 border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.4)] animate-pulse',
  }[masterStatus];

  const totalRps = summary?.totalRps ?? 48500;
  const paymentsRps = Math.round(totalRps * 0.42);
  const loginsRps = Math.round(totalRps * 0.28);
  const transfersRps = Math.round(totalRps * 0.16);
  const cardAuthRps = Math.round(totalRps * 0.14);

  return (
    <div
      className="p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 transition-all shadow-xl backdrop-blur-md relative"
      style={{
        background: 'hsl(var(--bg-surface-1) / 0.95)',
        borderColor: 'hsl(var(--border))',
      }}
    >
      {/* Title, Master Status Pill & Live OTel Badge */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center font-bold shadow-md"
            style={{
              background: 'hsl(215 85% 60% / 0.15)',
              color: 'hsl(215 85% 65%)',
            }}
          >
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white">
                Estate Command Center
              </h1>
              {/* Master Health Status Badge */}
              <div className={`px-2.5 py-0.5 rounded-full text-xs font-bold border uppercase flex items-center gap-1.5 ${statusBadgeStyle}`}>
                <span className="w-2 h-2 rounded-full bg-current animate-ping" />
                <span>ESTATE HEALTH: {masterStatus}</span>
              </div>

              {/* Demo Active Overlay Pill */}
              {activeScenario && (
                <div className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/25 text-amber-300 border border-amber-500/50 flex items-center gap-1 animate-pulse">
                  <Flame className="w-3 h-3 text-amber-400" />
                  <span>DEMO SCENARIO ACTIVE</span>
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Live enterprise technology estate topology · 25 Connected Banking Components
            </p>
          </div>
        </div>

        {/* Live OTel Telemetry Heartbeat Indicator */}
        <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs">
          <Zap className="w-4 h-4 text-emerald-400 animate-bounce" />
          <div>
            <div className="font-bold text-emerald-300 flex items-center gap-1">
              <span>OTel Live Stream</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              Updated 2s ago · Prometheus :9090
            </div>
          </div>
        </div>
      </div>

      {/* Live Transaction Activity HUD */}
      <div className="hidden xl:flex items-center gap-3 bg-slate-950/90 px-3 py-1.5 rounded-xl border border-slate-800 font-mono text-[11px]">
        <div className="text-slate-400 font-sans font-bold uppercase text-[10px] border-r border-slate-800 pr-2 flex items-center gap-1">
          <Radio className="w-3 h-3 text-blue-400 animate-pulse" /> Flows
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">PAYMENTS:</span>
          <span className="text-emerald-400 font-bold">{paymentsRps.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">LOGINS:</span>
          <span className="text-blue-400 font-bold">{loginsRps.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">TRANSFERS:</span>
          <span className="text-purple-400 font-bold">{transfersRps.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-slate-400">CARD AUTH:</span>
          <span className="text-amber-400 font-bold">{cardAuthRps.toLocaleString()}</span>
        </div>
      </div>

      {/* Operational RAG Health Counters & Filter Switcher */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center bg-slate-950/80 p-1.5 rounded-xl border border-slate-800/80 font-mono text-xs">
          <div className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
            <span className="text-slate-400 font-sans text-[11px]">Total:</span>
            <span className="font-bold text-white">{total}</span>
            <span className="text-emerald-400 font-bold ml-1">({healthyPercent}%)</span>
          </div>

          <div
            onClick={() => onFilterChange('GREEN')}
            className={`cursor-pointer px-2.5 py-1 rounded border transition-all flex items-center gap-1.5 ml-1.5 ${
              filter === 'GREEN'
                ? 'bg-emerald-500/30 text-emerald-200 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="font-bold">{green}</span>
            <span className="font-sans text-[11px]">Healthy</span>
          </div>

          <div
            onClick={() => onFilterChange('AMBER')}
            className={`cursor-pointer px-2.5 py-1 rounded border transition-all flex items-center gap-1.5 ml-1 ${
              filter === 'AMBER'
                ? 'bg-amber-500/30 text-amber-200 border-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                : 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="font-bold">{amber}</span>
            <span className="font-sans text-[11px]">Degraded</span>
          </div>

          <div
            onClick={() => onFilterChange('RED')}
            className={`cursor-pointer px-2.5 py-1 rounded border transition-all flex items-center gap-1.5 ml-1 ${
              filter === 'RED'
                ? 'bg-rose-500/35 text-rose-200 border-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.4)] animate-pulse'
                : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            <span className="font-bold">{red}</span>
            <span className="font-sans text-[11px]">Critical</span>
          </div>
        </div>

        {/* Chaos Simulation Scenario Dropdown Menu */}
        <div className="relative">
          <button
            onClick={() => setIsScenarioDropdownOpen((prev) => !prev)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-md ${
              activeScenario
                ? 'bg-rose-500/25 text-rose-200 border-rose-500/50 shadow-rose-500/20'
                : 'bg-purple-500/20 text-purple-300 border-purple-500/40 hover:bg-purple-500/30'
            }`}
          >
            <Flame className="w-4 h-4 text-purple-400" />
            <span>{activeScenario ? activeScenario.name : 'Chaos / Demo Scenarios'}</span>
            <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-70" />
          </button>

          {isScenarioDropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 p-2 space-y-1 text-xs animate-in fade-in slide-in-from-top-2">
              <div className="px-2 py-1.5 font-bold text-slate-300 border-b border-slate-800 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-purple-400" /> Demo Chaos Scenarios
                </span>
                <span className="text-[10px] text-slate-500 font-mono">9 Available</span>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-1 py-1">
                {CHAOS_SCENARIOS.map((sc: EstateChaosScenario) => (
                  <div
                    key={sc.id}
                    onClick={() => {
                      onSelectScenario(sc);
                      setIsScenarioDropdownOpen(false);
                    }}
                    className={`p-2 rounded-lg cursor-pointer transition-all border ${
                      activeScenario?.id === sc.id
                        ? 'bg-purple-500/30 border-purple-400 text-white font-bold'
                        : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-bold">{sc.name}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded uppercase font-mono ${
                          sc.health === 'RED'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {sc.riskLevel}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">{sc.description}</p>
                  </div>
                ))}
              </div>

              {activeScenario && (
                <button
                  onClick={() => {
                    onSelectScenario(null);
                    setIsScenarioDropdownOpen(false);
                  }}
                  className="w-full mt-1 p-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all border border-rose-500/30"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Clear Scenario / Reset Telemetry
                </button>
              )}
            </div>
          )}
        </div>

        {/* Reset Scenario Button if Scenario Active */}
        {activeScenario && (
          <button
            onClick={() => onSelectScenario(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-bold hover:bg-rose-500/30 transition-all"
            title="Clear active demo scenario"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-400" /> Reset Scenario
          </button>
        )}

        {/* Pause / Resume Flow Particle Animation Toggle */}
        <button
          onClick={onTogglePause}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
            isPaused
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
              : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
          }`}
        >
          {isPaused ? (
            <>
              <Play className="w-3.5 h-3.5 text-amber-400" /> Resume Flow
            </>
          ) : (
            <>
              <Pause className="w-3.5 h-3.5 text-blue-400" /> Pause Flow
            </>
          )}
        </button>
      </div>
    </div>
  );
};
