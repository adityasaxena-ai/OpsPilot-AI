import React from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Zap,
  Flame,
  Radio,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { EstateTopologySummary, EstateChaosScenario, BlastRadiusInfo } from '@opspilot/types';

interface LiveEstateActivitySectionProps {
  summary?: EstateTopologySummary;
  activeScenario?: EstateChaosScenario | null;
  blastRadius?: BlastRadiusInfo | null;
}

export const LiveEstateActivitySection: React.FC<LiveEstateActivitySectionProps> = ({
  summary,
  activeScenario,
  blastRadius,
}) => {
  const total = summary?.totalComponents ?? 25;
  const green = summary?.greenCount ?? 25;
  const amber = summary?.amberCount ?? 0;
  const red = summary?.redCount ?? 0;
  const healthyPercent = total > 0 ? Math.round((green / total) * 100) : 100;

  const totalRps = summary?.totalRps ?? 48500;
  const paymentsRps = Math.round(totalRps * 0.42);
  const transfersRps = Math.round(totalRps * 0.16);
  const loginsRps = Math.round(totalRps * 0.28);
  const cardAuthRps = Math.round(totalRps * 0.14);

  const masterStatus = red > 0 ? 'CRITICAL' : amber > 0 ? 'DEGRADED' : 'HEALTHY';

  const statusBadgeStyle = {
    HEALTHY: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]',
    DEGRADED: 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-[0_0_10px_rgba(245,158,11,0.3)] animate-pulse',
    CRITICAL: 'bg-rose-500/25 text-rose-300 border-rose-500/50 shadow-[0_0_12px_rgba(244,63,94,0.4)] animate-pulse',
  }[masterStatus];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4.5 pt-1 font-sans">
      {/* CARD 1: TRANSACTION ACTIVITY */}
      <div
        className="p-4 rounded-xl border backdrop-blur-md transition-all shadow-xl flex flex-col justify-between"
        style={{
          background: 'hsl(var(--bg-surface-1) / 0.95)',
          borderColor: 'hsl(var(--border))',
        }}
      >
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
            <Radio className="w-4 h-4 text-blue-400 animate-pulse" /> LIVE TRANSACTION ACTIVITY
          </h3>
          <span className="text-[10px] font-mono font-bold text-slate-400">
            TOTAL: {totalRps.toLocaleString()} RPS
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 font-mono text-xs">
          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] text-slate-400 block font-sans font-medium uppercase">PAYMENTS</span>
              <span className="text-emerald-400 font-bold text-sm">{paymentsRps.toLocaleString()}</span>
            </div>
            <div className="w-8 h-1.5 rounded-full bg-emerald-500/30 overflow-hidden">
              <div className="bg-emerald-400 h-full w-3/4" />
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] text-slate-400 block font-sans font-medium uppercase">TRANSFERS</span>
              <span className="text-purple-400 font-bold text-sm">{transfersRps.toLocaleString()}</span>
            </div>
            <div className="w-8 h-1.5 rounded-full bg-purple-500/30 overflow-hidden">
              <div className="bg-purple-400 h-full w-2/4" />
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] text-slate-400 block font-sans font-medium uppercase">LOGINS</span>
              <span className="text-blue-400 font-bold text-sm">{loginsRps.toLocaleString()}</span>
            </div>
            <div className="w-8 h-1.5 rounded-full bg-blue-500/30 overflow-hidden">
              <div className="bg-blue-400 h-full w-4/5" />
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] text-slate-400 block font-sans font-medium uppercase">CARD AUTH</span>
              <span className="text-amber-400 font-bold text-sm">{cardAuthRps.toLocaleString()}</span>
            </div>
            <div className="w-8 h-1.5 rounded-full bg-amber-500/30 overflow-hidden">
              <div className="bg-amber-400 h-full w-3/5" />
            </div>
          </div>
        </div>
      </div>

      {/* CARD 2: ESTATE HEALTH */}
      <div
        className="p-4 rounded-xl border backdrop-blur-md transition-all shadow-xl flex flex-col justify-between"
        style={{
          background: 'hsl(var(--bg-surface-1) / 0.95)',
          borderColor: 'hsl(var(--border))',
        }}
      >
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" /> ESTATE HEALTH OVERVIEW
          </h3>
          <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase flex items-center gap-1 ${statusBadgeStyle}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
            <span>{masterStatus}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center font-mono">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <div className="text-[10px] text-emerald-400 font-sans font-medium">HEALTHY</div>
            <div className="text-base font-bold text-emerald-300 mt-0.5">{green}</div>
          </div>
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <div className="text-[10px] text-amber-400 font-sans font-medium">DEGRADED</div>
            <div className="text-base font-bold text-amber-300 mt-0.5">{amber}</div>
          </div>
          <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30">
            <div className="text-[10px] text-rose-400 font-sans font-medium">CRITICAL</div>
            <div className="text-base font-bold text-rose-300 mt-0.5">{red}</div>
          </div>
        </div>

        <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Live OTel Stream (:9090)</span>
          </div>
          <div className="text-[10px] text-slate-400">
            Healthy: <span className="text-emerald-400 font-bold">{healthyPercent}%</span>
          </div>
        </div>
      </div>

      {/* CARD 3: ACTIVE IMPACT / INCIDENT */}
      <div
        className={`p-4 rounded-xl border backdrop-blur-md transition-all shadow-xl flex flex-col justify-between ${
          activeScenario || red > 0 ? 'border-rose-500/50 bg-rose-950/20' : ''
        }`}
        style={{
          background: activeScenario || red > 0 ? undefined : 'hsl(var(--bg-surface-1) / 0.95)',
          borderColor: activeScenario || red > 0 ? undefined : 'hsl(var(--border))',
        }}
      >
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
            {activeScenario || red > 0 ? (
              <Flame className="w-4 h-4 text-rose-400 animate-bounce" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            )}
            <span>ACTIVE IMPACT / INCIDENT</span>
          </h3>

          {activeScenario && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-rose-500/25 text-rose-200 border border-rose-500/50">
              {activeScenario.riskLevel} RISK
            </span>
          )}
        </div>

        {activeScenario || red > 0 ? (
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between bg-slate-950/80 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-400 text-[11px]">Root Cause:</span>
              <span className="font-bold text-rose-300 font-mono">
                {activeScenario?.targetComponentName ?? blastRadius?.rootCauseComponentName ?? 'Payment DB'}
              </span>
            </div>

            <div className="bg-slate-950/80 p-2 rounded-lg border border-slate-800 text-[11px] font-mono space-y-1">
              <span className="text-slate-400 block text-[10px] font-sans">Impact Chain:</span>
              <div className="flex items-center gap-1.5 text-amber-300 overflow-x-auto text-[10px] font-bold">
                <span>{blastRadius?.rootCauseComponentName ?? 'Payment DB'}</span>
                <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" />
                <span>Payments Microservice</span>
                <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" />
                <span>Visa Gateway</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
              <div className="p-1.5 rounded bg-slate-950/60 border border-slate-800 flex justify-between">
                <span className="text-slate-400 text-[10px]">Impacted:</span>
                <span className="font-bold text-white">{blastRadius?.totalImpactedComponentsCount ?? 4} nodes</span>
              </div>
              <div className="p-1.5 rounded bg-slate-950/60 border border-slate-800 flex justify-between">
                <span className="text-slate-400 text-[10px]">Impacted RPS:</span>
                <span className="font-bold text-amber-400">{(blastRadius?.totalImpactedRps ?? 1850).toLocaleString()}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-4 text-center space-y-1.5">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 opacity-90" />
            <div className="text-xs font-bold text-slate-200">No active critical impact</div>
            <div className="text-[11px] text-slate-400">
              All 25 banking estate components & transactions operating normally
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
