import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Activity, Bell, Clock, Zap, Server, TrendingUp, Shield, Sparkles, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { severityColor, timeAgo, formatDuration } from '@/lib/utils';

interface AnalyticsOverview {
  activeIncidents: number;
  activeSeverityBreakdown?: { P1: number; P2: number; P3: number; P4: number };
  resolvedToday: number;
  alertsToday: number;
  mttdSeconds: number;
  mttaSeconds: number;
  mttrSeconds: number;
  automationRate: number;
  aiTriageRate: number;
  sloCompliancePercent: number;
}

interface SimService {
  serviceId: string;
  cpuPercent: number;
  memoryPercent: number;
  errorRatePercent: number;
  latencyP99Ms: number;
  isHealthy: boolean;
  failureScenario: string | null;
  service: { name: string; slug: string; tier: string };
}

interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
  detectedAt: string;
  service: { name: string };
}

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
  to,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  sub?: string;
  to?: string;
}) {
  const content = (
    <div
      className={`rounded-xl p-4 border fade-in ${to ? 'cursor-pointer hover:border-slate-500 transition-all hover:opacity-90' : ''}`}
      style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'hsl(var(--text-tertiary))' }}>
          {label}
        </span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}1a` }}>
          <Icon size={14} style={{ color }} />
        </div>
      </div>
      <div className="text-2xl font-bold" style={{ color: 'hsl(var(--text-primary))' }}>
        {value}
      </div>
      {sub && <div className="text-xs mt-1" style={{ color: 'hsl(var(--text-tertiary))' }}>{sub}</div>}
    </div>
  );

  return to ? <Link to={to} className="block">{content}</Link> : content;
}

function ServiceHealthRow({ sim }: { sim: SimService }) {
  const healthColor = sim.isHealthy ? 'hsl(142 72% 45%)' : sim.failureScenario ? 'hsl(0 85% 60%)' : 'hsl(38 92% 50%)';

  return (
    <Link
      to={`/estate?selected=${sim.service.slug}`}
      className="flex items-center gap-4 px-4 py-3 rounded-lg border transition-colors hover:opacity-90 block"
      style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}
    >
      <div className="flex items-center gap-2 w-36 flex-none">
        <span className="w-2 h-2 rounded-full flex-none" style={{ background: healthColor }} />
        <span className="text-sm font-medium truncate" style={{ color: 'hsl(var(--text-primary))' }}>
          {sim.service.name}
        </span>
      </div>

      {/* Mini sparkbar for each metric */}
      <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: 'CPU', value: sim.cpuPercent, unit: '%', warn: 80 },
          { label: 'MEM', value: sim.memoryPercent, unit: '%', warn: 85 },
          { label: 'ERR', value: sim.errorRatePercent, unit: '%', warn: 5 },
          { label: 'P99', value: sim.latencyP99Ms, unit: 'ms', warn: 2000 },
        ].map((m) => (
          <div key={m.label}>
            <div className="flex justify-between text-xs mb-0.5">
              <span style={{ color: 'hsl(var(--text-tertiary))' }}>{m.label}</span>
              <span
                style={{
                  color: m.value > m.warn ? 'hsl(0 85% 65%)' : 'hsl(var(--text-secondary))',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                }}
              >
                {m.value > 1 ? Math.round(m.value) : m.value.toFixed(2)}
                {m.unit}
              </span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'hsl(var(--bg-surface-3))' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, (m.value / m.warn) * 100)}%`,
                  background: m.value > m.warn ? 'hsl(0 85% 60%)' : 'hsl(220 90% 56%)',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {sim.failureScenario && (
        <span
          className="text-xs px-2 py-0.5 rounded-full border flex-none"
          style={{
            background: 'hsl(0 85% 60% / 0.1)',
            color: 'hsl(0 85% 70%)',
            borderColor: 'hsl(0 85% 60% / 0.3)',
          }}
        >
          {sim.failureScenario.replace(/_/g, ' ')}
        </span>
      )}
    </Link>
  );
}

export function CommandCenter() {
  const queryClient = useQueryClient();

  const { data: overviewData, isLoading: overviewLoading } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => api.analytics.overview(),
    refetchInterval: 15_000,
  });

  const { data: simData } = useQuery({
    queryKey: ['simulator', 'status'],
    queryFn: () => api.simulator.status(),
    refetchInterval: 15_000,
  });

  const { data: incidentsData } = useQuery({
    queryKey: ['incidents', { limit: '5' }],
    queryFn: () => api.incidents.list({ limit: '5' }),
    refetchInterval: 15_000,
  });

  const { data: telemetryData } = useQuery({
    queryKey: ['telemetry', 'status'],
    queryFn: () => api.telemetry.status(),
    refetchInterval: 10_000,
  });

  const setProviderMutation = useMutation({
    mutationFn: async (provider: 'otel' | 'mock' | 'replay') => {
      if (provider === 'replay') {
        const res = await api.telemetry.startReplay();
        return res;
      }
      return api.telemetry.setProvider(provider);
    },
    onSuccess: (data) => {
      if (data?.data) {
        queryClient.setQueryData(['telemetry', 'status'], { success: true, data: data.data });
      }
      queryClient.invalidateQueries({ queryKey: ['telemetry'] });
      queryClient.invalidateQueries({ queryKey: ['simulator'] });
    },
  });

  const overview = overviewData?.data as AnalyticsOverview | undefined;
  const simServices = (simData?.data as SimService[] | undefined) ?? [];
  const recentIncidents = (incidentsData?.data as Incident[] | undefined) ?? [];
  const telemetryStatus = telemetryData?.data;
  const isReplayActive = telemetryStatus?.providerName === 'replay' || telemetryStatus?.isReplaying === true;

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>
            Operations Command Center
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--text-tertiary))' }}>
            Real-time operational intelligence · OpenTelemetry Provider Architecture
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>
          <span className="pulse-dot" style={{ background: isReplayActive ? 'hsl(265 85% 65%)' : 'hsl(142 72% 45%)' }} />
          Live · refreshes every 10s
        </div>
      </div>

      {/* Telemetry Provider Status Banner */}
      <div
        className="rounded-xl p-3.5 sm:p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        style={{
          background: isReplayActive
            ? 'hsl(265 85% 65% / 0.1)'
            : telemetryStatus?.status === 'HEALTHY'
            ? 'hsl(142 72% 45% / 0.1)'
            : telemetryStatus?.status === 'DEGRADED'
            ? 'hsl(38 92% 50% / 0.1)'
            : telemetryStatus
            ? 'hsl(0 85% 60% / 0.1)'
            : 'hsl(var(--bg-surface-2))',
          borderColor: 'hsl(var(--border))',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-none"
            style={{ background: 'hsl(220 90% 56% / 0.15)' }}
          >
            <Activity size={16} style={{ color: 'hsl(220 90% 65%)' }} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold" style={{ color: 'hsl(var(--text-primary))' }}>
                Active Telemetry Source: {telemetryStatus?.activeSource ?? 'Initializing…'}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: isReplayActive
                    ? 'hsl(265 85% 65% / 0.15)'
                    : telemetryStatus?.status === 'HEALTHY'
                    ? 'hsl(142 72% 45% / 0.15)'
                    : telemetryStatus?.status === 'DEGRADED'
                    ? 'hsl(38 92% 50% / 0.15)'
                    : 'hsl(0 85% 60% / 0.15)',
                  color: isReplayActive
                    ? 'hsl(265 85% 70%)'
                    : telemetryStatus?.status === 'HEALTHY'
                    ? 'hsl(142 72% 55%)'
                    : telemetryStatus?.status === 'DEGRADED'
                    ? 'hsl(38 92% 60%)'
                    : 'hsl(0 85% 65%)',
                }}
              >
                {isReplayActive
                  ? 'REPLAY MODE ACTIVE'
                  : telemetryStatus?.status === 'HEALTHY'
                  ? 'HEALTHY'
                  : telemetryStatus?.status === 'DEGRADED'
                  ? 'DEGRADED'
                  : telemetryStatus
                  ? 'UNAVAILABLE'
                  : '—'}
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--text-tertiary))' }}>
              Telemetry metrics refreshed continuously every 10 seconds.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setProviderMutation.mutate('otel')}
            disabled={setProviderMutation.isPending}
            className="px-2.5 py-1 rounded text-xs font-medium border transition-all hover:opacity-80 disabled:opacity-50"
            style={{
              background: !isReplayActive && telemetryStatus?.providerName === 'otel'
                ? telemetryStatus?.status === 'HEALTHY'
                  ? 'hsl(142 72% 45% / 0.2)'
                  : telemetryStatus?.details?.configured === false
                  ? 'hsl(38 92% 50% / 0.2)'
                  : 'hsl(0 85% 60% / 0.2)'
                : 'transparent',
              borderColor: !isReplayActive && telemetryStatus?.providerName === 'otel'
                ? telemetryStatus?.status === 'HEALTHY'
                  ? 'hsl(142 72% 45% / 0.4)'
                  : telemetryStatus?.details?.configured === false
                  ? 'hsl(38 92% 50% / 0.4)'
                  : 'hsl(0 85% 60% / 0.4)'
                : 'hsl(var(--border))',
              color: !isReplayActive && telemetryStatus?.providerName === 'otel'
                ? telemetryStatus?.status === 'HEALTHY'
                  ? 'hsl(142 72% 55%)'
                  : telemetryStatus?.details?.configured === false
                  ? 'hsl(38 92% 60%)'
                  : 'hsl(0 85% 65%)'
                : 'hsl(var(--text-secondary))',
            }}
          >
            OTel Live
          </button>

          <button
            onClick={() => setProviderMutation.mutate('mock')}
            disabled={setProviderMutation.isPending}
            className="px-2.5 py-1 rounded text-xs font-medium border transition-all hover:opacity-80 disabled:opacity-50"
            style={{
              background: !isReplayActive && telemetryStatus?.providerName === 'mock' ? 'hsl(220 90% 56% / 0.2)' : 'transparent',
              borderColor: !isReplayActive && telemetryStatus?.providerName === 'mock' ? 'hsl(220 90% 56% / 0.4)' : 'hsl(var(--border))',
              color: !isReplayActive && telemetryStatus?.providerName === 'mock' ? 'hsl(220 90% 60%)' : 'hsl(var(--text-secondary))',
            }}
          >
            Demo Simulation
          </button>

          <button
            onClick={() => setProviderMutation.mutate('replay')}
            disabled={setProviderMutation.isPending}
            className="px-2.5 py-1 rounded text-xs font-medium border transition-all hover:opacity-80 disabled:opacity-50"
            style={{
              background: isReplayActive ? 'hsl(265 85% 65% / 0.2)' : 'transparent',
              borderColor: isReplayActive ? 'hsl(265 85% 65% / 0.4)' : 'hsl(var(--border))',
              color: isReplayActive ? 'hsl(265 85% 70%)' : 'hsl(var(--text-secondary))',
            }}
          >
            Replay Mode
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          label="Active Incidents"
          value={overviewLoading ? '—' : (overview?.activeIncidents ?? 0)}
          icon={AlertTriangle}
          color="hsl(0 85% 65%)"
          sub={`${overview?.resolvedToday ?? 0} resolved today`}
          to="/incidents?status=ACTIVE"
        />
        <MetricCard
          label="Alerts Today"
          value={overviewLoading ? '—' : (overview?.alertsToday ?? 0)}
          icon={Bell}
          color="hsl(25 95% 60%)"
          sub="Triggered alert notifications"
          to="/incidents"
        />
        <MetricCard
          label="MTTR"
          value={overview?.mttrSeconds ? formatDuration(overview.mttrSeconds) : '—'}
          icon={Clock}
          color="hsl(200 80% 57%)"
          sub="Mean time to resolve"
          to="/analytics"
        />
        <MetricCard
          label="SLO Compliance"
          value={overview?.sloCompliancePercent != null ? `${overview.sloCompliancePercent}%` : '—'}
          icon={Zap}
          color="hsl(142 72% 45%)"
          sub="Target: 99.0%"
          to="/analytics"
        />
      </div>

      {/* Row 2 KPI Grid: MTTD | MTTA | SLO Compliance | Automation Rate */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <MetricCard
          label="MTTD"
          value={overview?.mttdSeconds ? formatDuration(overview.mttdSeconds) : '—'}
          icon={Activity}
          color="hsl(48 95% 58%)"
          sub="Mean time to detect"
          to="/analytics"
        />
        <MetricCard
          label="MTTA"
          value={overview?.mttaSeconds ? formatDuration(overview.mttaSeconds) : '—'}
          icon={TrendingUp}
          color="hsl(160 60% 55%)"
          sub="Mean time to acknowledge"
          to="/analytics"
        />
        <MetricCard
          label="SLO Compliance"
          value={overview?.sloCompliancePercent != null ? `${overview.sloCompliancePercent}%` : '—'}
          icon={Shield}
          color="hsl(142 72% 45%)"
        />
        <MetricCard
          label="Automation Rate"
          value={overview?.automationRate != null ? `${overview.automationRate}%` : '—'}
          icon={Server}
          color="hsl(220 90% 56%)"
          sub="AI-assisted incidents"
        />
      </div>

      {/* Row 3 Operational Intelligence Grid: AI Operations Summary | Recent Change Risk | Active Severity Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* 1. AI Operations Summary Card */}
        <div
          className="rounded-xl p-4 border flex flex-col justify-between gap-3 text-xs fade-in"
          style={{
            background: 'hsl(265 85% 65% / 0.08)',
            borderColor: 'hsl(265 85% 65% / 0.3)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 shrink-0">
              <Sparkles size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2 font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>
                <span>AI Operations Summary</span>
              </div>
              <span className="text-[11px] font-mono text-indigo-300 mt-0.5 block">
                {overview?.activeIncidents ?? recentIncidents.length} Active Incidents Requiring Attention
              </span>
            </div>
          </div>
          <p className="text-xs" style={{ color: 'hsl(var(--text-secondary))' }}>
            {recentIncidents.length > 0
              ? `High-confidence triage active. Primary critical impact on ${recentIncidents[0]?.service?.name ?? 'core service'}.`
              : 'All services operating within normal telemetry parameters.'}
          </p>
          <Link
            to="/incidents?status=IMMEDIATE_ATTENTION"
            className="px-3 py-2 rounded-lg font-semibold bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 flex items-center justify-between transition-all min-h-[44px] sm:min-h-0"
          >
            <span>View Co-Pilot Triage</span>
            <ArrowRight size={13} />
          </Link>
        </div>

        {/* 2. Recent Change Risk Indicator Card */}
        <Link
          to="/incidents?change=v2.4.0-bad"
          className="rounded-xl p-4 border text-xs fade-in flex flex-col justify-between transition-all hover:border-amber-500/50 bg-amber-950/20 border-amber-500/30 min-h-[44px]"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold uppercase tracking-wider text-[11px] text-amber-300">RECENT CHANGE RISK</span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              HIGH
            </span>
          </div>
          <div className="text-amber-200 space-y-1">
            <span className="font-semibold block">{recentIncidents.length} correlated active incidents</span>
            <p className="text-[11px] text-amber-300/80 leading-snug">
              Correlated release: <span className="font-mono font-bold text-amber-200">v2.4.0-bad</span> on {recentIncidents[0]?.service?.name ?? 'Payment DB'}
            </p>
          </div>
          <div className="flex items-center justify-between text-amber-300 font-semibold text-[11px] pt-1 border-t border-amber-500/20">
            <span>Inspect Correlated Group</span>
            <ArrowRight size={13} />
          </div>
        </Link>

        {/* 3. Active Severity Breakdown Card */}
        <div
          className="rounded-xl p-4 border flex flex-col justify-between gap-2 text-xs"
          style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold uppercase tracking-wider text-[11px]" style={{ color: 'hsl(var(--text-tertiary))' }}>
              Active Severity Breakdown
            </span>
            <span className="text-[10px] font-mono text-slate-400 font-medium">Live Tally</span>
          </div>
          <div className="grid grid-cols-2 gap-2 font-mono">
            <Link
              to="/incidents?status=ACTIVE&severity=P1"
              className="p-2 rounded-lg border flex items-center justify-between transition-opacity hover:opacity-80"
              style={{
                background: 'hsl(0 85% 60% / 0.15)',
                borderColor: 'hsl(0 85% 60% / 0.3)',
                color: 'hsl(0 85% 70%)',
              }}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-xs font-semibold">P1</span>
              </div>
              <span className="font-bold">
                {overview?.activeSeverityBreakdown?.P1 ?? recentIncidents.filter((i) => i.severity === 'P1_CRITICAL' || i.severity === 'P1').length}
              </span>
            </Link>
            <Link
              to="/incidents?status=ACTIVE&severity=P2"
              className="p-2 rounded-lg border flex items-center justify-between transition-opacity hover:opacity-80"
              style={{
                background: 'hsl(25 95% 60% / 0.15)',
                borderColor: 'hsl(25 95% 60% / 0.3)',
                color: 'hsl(25 95% 65%)',
              }}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-xs font-semibold">P2</span>
              </div>
              <span className="font-bold">
                {overview?.activeSeverityBreakdown?.P2 ?? recentIncidents.filter((i) => i.severity === 'P2_HIGH' || i.severity === 'P2').length}
              </span>
            </Link>
            <Link
              to="/incidents?status=ACTIVE&severity=P3"
              className="p-2 rounded-lg border flex items-center justify-between transition-opacity hover:opacity-80"
              style={{
                background: 'hsl(48 95% 58% / 0.15)',
                borderColor: 'hsl(48 95% 58% / 0.3)',
                color: 'hsl(48 95% 65%)',
              }}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                <span className="text-xs font-semibold">P3</span>
              </div>
              <span className="font-bold">
                {overview?.activeSeverityBreakdown?.P3 ?? recentIncidents.filter((i) => i.severity === 'P3_MEDIUM' || i.severity === 'P3').length}
              </span>
            </Link>
            <Link
              to="/incidents?status=ACTIVE&severity=P4"
              className="p-2 rounded-lg border flex items-center justify-between transition-opacity hover:opacity-80"
              style={{
                background: 'hsl(200 80% 57% / 0.15)',
                borderColor: 'hsl(200 80% 57% / 0.3)',
                color: 'hsl(200 80% 65%)',
              }}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-xs font-semibold">P4</span>
              </div>
              <span className="font-bold">
                {overview?.activeSeverityBreakdown?.P4 ?? recentIncidents.filter((i) => i.severity === 'P4_LOW' || i.severity === 'P4').length}
              </span>
            </Link>
          </div>
        </div>
      </div>

      {/* Service Health + Incidents side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Service Health — spans 2 cols on lg */}
        <div
          className="lg:col-span-2 rounded-xl border p-4"
          style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>
              Service Health
            </h2>
            <Link
              to="/services"
              className="text-xs transition-opacity hover:opacity-70"
              style={{ color: 'hsl(220 90% 65%)' }}
            >
              View all →
            </Link>
          </div>
          <div className="space-y-2">
            {simServices.length === 0
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="skeleton h-12 w-full" />
                ))
              : simServices.slice(0, 8).map((sim) => (
                  <ServiceHealthRow key={sim.serviceId} sim={sim} />
                ))}
          </div>
        </div>

        {/* Recent Incidents — spans 1 col */}
        <div
          className="rounded-xl border p-4"
          style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>
              Recent Incidents
            </h2>
            <Link
              to="/incidents"
              className="text-xs transition-opacity hover:opacity-70"
              style={{ color: 'hsl(220 90% 65%)' }}
            >
              View all →
            </Link>
          </div>

          {recentIncidents.length === 0 ? (
            <div className="text-center py-8">
              <Shield size={24} className="mx-auto mb-2" style={{ color: 'hsl(var(--text-tertiary))' }} />
              <p className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>
                No active incidents
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--text-tertiary))' }}>
                Inject a failure from Chaos Lab
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentIncidents.map((inc) => (
                <Link
                  key={inc.id}
                  to={`/incidents/${inc.id}`}
                  className="block p-3 rounded-lg border transition-all hover:opacity-80"
                  style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs font-bold px-1.5 py-0.5 rounded"
                      style={{
                        background: `${severityColor(inc.severity)}1a`,
                        color: severityColor(inc.severity),
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {inc.severity}
                    </span>
                    <span className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>
                      {inc.service?.name}
                    </span>
                  </div>
                  <p className="text-xs font-medium truncate" style={{ color: 'hsl(var(--text-primary))' }}>
                    {inc.title}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--text-tertiary))' }}>
                    {timeAgo(inc.detectedAt)} · {inc.status}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
