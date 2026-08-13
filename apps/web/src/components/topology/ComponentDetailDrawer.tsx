import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  Activity,
  AlertTriangle,
  Flame,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Cpu,
  Database,
  Clock,
  Layers,
  Zap,
  Server,
  HardDrive,
  Radio,
  Search,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../../lib/api';
import { ComponentDetail, EstateNode, EstateChaosScenario } from '@opspilot/types';

interface ComponentDetailDrawerProps {
  componentId: string | null;
  topologyNode?: EstateNode | null;
  activeScenario?: EstateChaosScenario | null;
  onClose: () => void;
  onSelectComponent: (id: string) => void;
}

export const ComponentDetailDrawer: React.FC<ComponentDetailDrawerProps> = ({
  componentId,
  topologyNode,
  activeScenario,
  onClose,
  onSelectComponent,
}) => {
  const navigate = useNavigate();

  const { data: detailData, isLoading } = useQuery({
    queryKey: ['topology', 'component', componentId],
    queryFn: async () => {
      if (!componentId) return null;
      const res = await api.topology.getComponentDetail(componentId);
      return res.data;
    },
    enabled: Boolean(componentId),
    refetchInterval: 5000,
  });

  const { data: incidentsListData } = useQuery({
    queryKey: ['incidents', 'list', 'drawer'],
    queryFn: () => api.incidents.list({ limit: '50' }),
    enabled: Boolean(componentId),
    refetchInterval: 10_000,
  });

  if (!componentId) return null;

  const detail: ComponentDetail | undefined = detailData ?? undefined;
  const node = detail?.node;

  const allIncidents = (incidentsListData?.data as any[] | undefined) ?? [];
  const targetId = componentId.toLowerCase();
  const targetClean = targetId.replace(/-/g, ' ');
  const componentName = (topologyNode?.name ?? node?.name ?? '').toLowerCase();

  // Strict Matching Priority Order:
  // 1. serviceId / service.id === componentId
  // 2. service.slug === componentId
  // 3. exact service.name === componentName or targetClean
  const matchingIncident = allIncidents.find((inc) => {
    const incServiceId = (inc.serviceId ?? inc.service?.id ?? '').toLowerCase();
    const incSlug = (inc.service?.slug ?? '').toLowerCase();
    const incName = (inc.service?.name ?? '').toLowerCase();

    if (incServiceId === targetId || incSlug === targetId) return true;
    if (incName.length > 0 && (incName === componentName || incName === targetClean)) return true;
    return false;
  });

  const detailIncident = detail?.activeIncidents?.find((inc: any) => {
    const incServiceId = (inc.serviceId ?? inc.service?.id ?? '').toLowerCase();
    const incSlug = (inc.service?.slug ?? '').toLowerCase();
    const incName = (inc.serviceName ?? inc.service?.name ?? '').toLowerCase();
    return (
      incServiceId === targetId ||
      incSlug === targetId ||
      incName === componentName ||
      incName === targetClean
    );
  });

  // Effective incident MUST strictly belong to this component (NO generic fallbacks)
  const effectiveIncident = detailIncident ?? matchingIncident ?? null;
  
  // Single Source of Truth: Topology node health overrides backend component detail health
  const health = topologyNode?.health ?? node?.health ?? 'GREEN';

  // Derived operational metrics from topology node if present, fallback to detail node
  const throughputRps = topologyNode?.metrics.throughputRps ?? node?.metrics.throughputRps ?? 0;
  const p99 = topologyNode?.metrics.latencyP99Ms ?? node?.metrics.latencyP99Ms ?? 45;
  const p50 = Math.round(p99 * 0.35);
  const p95 = Math.round(p99 * 0.85);
  const errorRatePercent = topologyNode?.metrics.errorRatePercent ?? node?.metrics.errorRatePercent ?? 0;
  const cpuPercent = topologyNode?.metrics.cpuPercent ?? node?.metrics.cpuPercent ?? 30;
  const memoryPercent = topologyNode?.metrics.memoryPercent ?? node?.metrics.memoryPercent ?? 40;

  return (
    <div
      className="fixed inset-y-0 right-0 w-full sm:w-[500px] z-50 shadow-2xl border-l backdrop-blur-xl flex flex-col transition-all animate-in slide-in-from-right duration-300"
      style={{
        background: 'hsl(var(--bg-surface-1) / 0.96)',
        borderColor: 'hsl(var(--border))',
      }}
    >
      {/* Drawer Header */}
      <div className="p-4 border-b flex items-center justify-between bg-slate-900/80 border-slate-800">
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold border shadow-lg ${
              health === 'RED'
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-400 shadow-rose-500/20'
                : health === 'AMBER'
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-amber-500/20'
                : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-emerald-500/20'
            }`}
          >
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              {node?.name ?? componentId}
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide border ${
                  health === 'RED'
                    ? 'bg-rose-500/30 text-rose-200 border-rose-500/60 animate-pulse'
                    : health === 'AMBER'
                    ? 'bg-amber-500/25 text-amber-300 border-amber-500/50'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                }`}
              >
                {health === 'RED' ? 'CRITICAL' : health === 'AMBER' ? 'DEGRADED' : 'HEALTHY'}
              </span>
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              {node?.layerLabel} · ID: {node?.id}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-slate-400 flex-1 flex items-center justify-center">
          <Activity className="w-6 h-6 animate-spin text-blue-500 mr-2" />
          <span>Loading live telemetry details...</span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Key Telemetry Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80">
              <span className="text-[10px] text-slate-400 font-medium block uppercase font-sans">Throughput</span>
              <span className="text-base font-bold text-white">{throughputRps}</span>
              <span className="text-[10px] text-slate-500 block font-sans">RPS</span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80">
              <span className="text-[10px] text-slate-400 font-medium block uppercase font-sans">P50 / P95 / P99</span>
              <span
                className={`text-base font-bold ${
                  p99 > 500 ? 'text-amber-400' : 'text-white'
                }`}
              >
                {p99}
              </span>
              <span className="text-[10px] text-slate-500 block font-sans">{p50}/{p95}/{p99}ms</span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80">
              <span className="text-[10px] text-slate-400 font-medium block uppercase font-sans">Error Rate</span>
              <span
                className={`text-base font-bold ${
                  errorRatePercent > 1.0 ? 'text-rose-400' : 'text-white'
                }`}
              >
                {errorRatePercent.toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-500 block font-sans">http 5xx</span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80">
              <span className="text-[10px] text-slate-400 font-medium block uppercase font-sans">Conn / Queue</span>
              <span className="text-base font-bold text-white">
                {componentId.includes('db') ? '48' : componentId.includes('broker') ? '120' : '16'}
              </span>
              <span className="text-[10px] text-slate-500 block font-sans">active</span>
            </div>
          </div>

          {/* Resource Utilization Sliders */}
          <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-blue-400" /> CPU Utilization
              </span>
              <span className="font-mono text-white font-bold">{cpuPercent}%</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all"
                style={{ width: `${Math.min(100, cpuPercent)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-slate-300 font-medium flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-purple-400" /> Memory Usage
              </span>
              <span className="font-mono text-white font-bold">{memoryPercent}%</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-purple-500 h-full transition-all"
                style={{ width: `${Math.min(100, memoryPercent)}%` }}
              />
            </div>
          </div>

          {/* Blast Radius Analysis Section */}
          {detail?.blastRadius && (
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Activity className="w-3.5 h-3.5 text-purple-400" /> Blast Radius Analysis
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  {detail.blastRadius.riskLevel} RISK
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 font-mono text-[11px] bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80">
                <div>
                  <span className="text-slate-400 block font-sans text-[10px]">Direct Upstream</span>
                  <span className="text-white font-bold">{detail.blastRadius.upstreamImpactCount} nodes</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-sans text-[10px]">Downstream Impact</span>
                  <span className="text-amber-400 font-bold">{detail.blastRadius.downstreamImpactCount} nodes</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-sans text-[10px]">Impacted RPS</span>
                  <span className="text-rose-400 font-bold">{detail.blastRadius.totalImpactedRps.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Component Transaction Types Breakdown */}
          {detail?.transactionTypes && (
            <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80 space-y-2">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-blue-400" /> Transaction Flow Types
              </h3>
              <div className="space-y-1.5 text-xs font-mono">
                {detail.transactionTypes.map((t) => (
                  <div key={t.type} className="flex items-center justify-between bg-slate-950/60 px-2.5 py-1 rounded border border-slate-800/60">
                    <span className="text-slate-300">{t.type}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-blue-400 font-bold">{t.rps} RPS</span>
                      <span className="text-slate-500 text-[10px]">({t.percentage}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 10-Minute Live OTel Telemetry Trend */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-400" /> 10-Min Telemetry Trend
              </h3>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono font-bold">
                <Zap className="w-3 h-3 animate-pulse" /> Live OTel Stream
              </span>
            </div>

            <div className="h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={detail?.telemetryHistory ?? []}>
                  <defs>
                    <linearGradient id="rpsColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="timestamp" stroke="#64748b" fontSize={9} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={9} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Area type="monotone" dataKey="rps" stroke="#3b82f6" fillOpacity={1} fill="url(#rpsColor)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Active Incidents & Investigation CTA */}
          {(health === 'RED' || effectiveIncident || (detail?.activeIncidents && detail.activeIncidents.length > 0)) && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2.5">
              <h3 className="text-xs font-bold text-rose-300 uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-rose-400 animate-bounce" /> Active Incident Link
                </span>
                <span className="px-2 py-0.5 rounded bg-rose-500/30 text-rose-200 border border-rose-500/50 font-mono text-[10px]">
                  {effectiveIncident?.severity ?? detail?.activeIncidents?.[0]?.severity ?? 'CRITICAL'}
                </span>
              </h3>

              {effectiveIncident ? (
                <div className="p-3 rounded-lg bg-slate-900/90 border border-rose-500/30 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white font-mono">{effectiveIncident.incidentNumber ?? effectiveIncident.id}</span>
                    <span className="px-2 py-0.5 rounded bg-rose-500 text-white font-bold text-[10px]">
                      {effectiveIncident.severity ?? 'P1'}
                    </span>
                  </div>
                  <p className="text-slate-200 font-medium">{effectiveIncident.title}</p>
                  <button
                    onClick={() => navigate(`/incidents/${effectiveIncident.id}`)}
                    className="w-full py-1.5 px-3 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-rose-600/30"
                  >
                    <Search className="w-3.5 h-3.5" /> INVESTIGATE INCIDENT & VIEW RCA
                  </button>
                </div>
              ) : detail?.activeIncidents && detail.activeIncidents.length > 0 ? (
                detail.activeIncidents.map((inc: any) => (
                  <div key={inc.id} className="p-3 rounded-lg bg-slate-900/90 border border-rose-500/30 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white font-mono">{inc.incidentNumber ?? inc.id}</span>
                      <span className="px-2 py-0.5 rounded bg-rose-500 text-white font-bold text-[10px]">
                        {inc.severity}
                      </span>
                    </div>
                    <p className="text-slate-200 font-medium">{inc.title}</p>
                    <button
                      onClick={() => navigate(`/incidents/${inc.id}`)}
                      className="w-full py-1.5 px-3 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-rose-600/30"
                    >
                      <Search className="w-3.5 h-3.5" /> INVESTIGATE INCIDENT & VIEW RCA
                    </button>
                  </div>
                ))
              ) : (
                <div className="p-3 rounded-lg bg-slate-900/90 border border-rose-500/30 text-xs space-y-2">
                  <p className="text-slate-200 font-medium">
                    {activeScenario?.name ?? `Critical anomaly detected on ${topologyNode?.name ?? componentId}`}
                  </p>
                  <button
                    onClick={() => navigate('/incidents')}
                    className="w-full py-1.5 px-3 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-rose-600/30"
                  >
                    <Search className="w-3.5 h-3.5" /> INVESTIGATE INCIDENT FEED
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Upstream Dependencies */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5 text-blue-400" /> Upstream Dependencies (
              {detail?.upstreamDependencies.length ?? 0})
            </h3>
            <div className="space-y-1.5">
              {detail?.upstreamDependencies.map((dep: any) => (
                <div
                  key={dep.id}
                  onClick={() => onSelectComponent(dep.id)}
                  className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-blue-500/50 flex items-center justify-between cursor-pointer transition-all text-xs"
                >
                  <span className="text-slate-200 font-medium">{dep.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded">
                    {dep.relationshipType}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Downstream Dependents */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <ArrowRight className="w-3.5 h-3.5 text-purple-400" /> Downstream Dependents (
              {detail?.downstreamDependents.length ?? 0})
            </h3>
            <div className="space-y-1.5">
              {detail?.downstreamDependents.map((dep: any) => (
                <div
                  key={dep.id}
                  onClick={() => onSelectComponent(dep.id)}
                  className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-purple-500/50 flex items-center justify-between cursor-pointer transition-all text-xs"
                >
                  <span className="text-slate-200 font-medium">{dep.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded">
                    {dep.relationshipType}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
