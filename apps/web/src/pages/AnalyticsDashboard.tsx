import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { api } from '@/lib/api';
import { formatDuration } from '@/lib/utils';

interface Overview {
  activeIncidents: number;
  mttdSeconds: number;
  mttaSeconds: number;
  mttrSeconds: number;
  aiTriageRate: number;
  automationRate: number;
  sloCompliancePercent: number;
  resolvedToday: number;
}

interface IncidentStats {
  byDay: Record<string, number>;
  bySeverity: Record<string, number>;
  total: number;
}

interface AutomationStats {
  totalIncidents: number;
  aiTriaged: number;
  remediationsProposed: number;
  remediationsSucceeded: number;
  successRate: number;
  estimatedHoursSaved: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  P1: 'hsl(0 85% 60%)',
  P2: 'hsl(25 95% 55%)',
  P3: 'hsl(48 95% 53%)',
  P4: 'hsl(200 80% 52%)',
  P5: 'hsl(160 60% 50%)',
};

export function AnalyticsDashboard() {
  const { data: overviewData } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => api.analytics.overview(),
    refetchInterval: 30_000,
  });

  const { data: incidentStatsData } = useQuery({
    queryKey: ['analytics', 'incidents'],
    queryFn: () => api.analytics.incidents(30),
    refetchInterval: 60_000,
  });

  const { data: automationData } = useQuery({
    queryKey: ['analytics', 'automation'],
    queryFn: () => api.analytics.automation(),
    refetchInterval: 30_000,
  });

  const overview = overviewData?.data as Overview | undefined;
  const incidentStats = incidentStatsData?.data as IncidentStats | undefined;
  const automation = automationData?.data as AutomationStats | undefined;

  const dailyData = incidentStats?.byDay
    ? Object.entries(incidentStats.byDay).map(([date, count]) => ({
        date: date.substring(5), // MM-DD
        count,
      }))
    : [];

  const severityData = incidentStats?.bySeverity
    ? Object.entries(incidentStats.bySeverity).map(([sev, count]) => ({ name: sev, value: count }))
    : [];

  const KPI = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div
      className="rounded-xl border p-4"
      style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
    >
      <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'hsl(var(--text-tertiary))' }}>
        {label}
      </div>
      <div className="text-2xl font-bold" style={{ color: 'hsl(var(--text-primary))' }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: 'hsl(var(--text-tertiary))' }}>{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-6 fade-in">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>Analytics</h1>
        <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--text-tertiary))' }}>
          30-day operational metrics · last 30 days
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-5 gap-4">
        <KPI label="MTTD" value={overview?.mttdSeconds ? formatDuration(overview.mttdSeconds) : '—'} sub="detection" />
        <KPI label="MTTA" value={overview?.mttaSeconds ? formatDuration(overview.mttaSeconds) : '—'} sub="acknowledgement" />
        <KPI label="MTTR" value={overview?.mttrSeconds ? formatDuration(overview.mttrSeconds) : '—'} sub="resolution" />
        <KPI label="SLO Compliance" value={overview?.sloCompliancePercent != null ? `${overview.sloCompliancePercent}%` : '—'} />
        <KPI label="Hours Saved" value={automation?.estimatedHoursSaved != null ? `${automation.estimatedHoursSaved.toFixed(0)}h` : '—'} sub="via AI automation" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-3 gap-4">
        {/* Daily incidents bar chart */}
        <div
          className="col-span-2 rounded-xl border p-5"
          style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'hsl(var(--text-primary))' }}>
            Incidents per Day (Last 30 Days)
          </h2>
          {dailyData.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>
                No incident data yet — inject a failure in Chaos Lab
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dailyData}>
                <XAxis dataKey="date" tick={{ fill: 'hsl(var(--text-tertiary))', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'hsl(var(--text-tertiary))', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--bg-surface-2))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    color: 'hsl(var(--text-primary))',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="hsl(220 90% 56%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Severity donut */}
        <div
          className="rounded-xl border p-5"
          style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: 'hsl(var(--text-primary))' }}>
            By Severity
          </h2>
          {severityData.every((d) => d.value === 0) ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>No data</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie
                    data={severityData.filter((d) => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={60}
                    dataKey="value"
                    stroke="none"
                  >
                    {severityData.map((entry) => (
                      <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] ?? 'hsl(var(--text-tertiary))'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--bg-surface-2))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      color: 'hsl(var(--text-primary))',
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-3 gap-1 mt-2">
                {severityData.map((d) => (
                  <div key={d.name} className="text-center">
                    <div className="text-xs font-bold" style={{ color: SEVERITY_COLORS[d.name] }}>{d.name}</div>
                    <div className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>{d.value}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Automation stats */}
      <div
        className="rounded-xl border p-5"
        style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
      >
        <h2 className="text-sm font-semibold mb-4" style={{ color: 'hsl(var(--text-primary))' }}>
          AI Automation Performance
        </h2>
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: 'Total Incidents', value: automation?.totalIncidents ?? '—' },
            { label: 'AI Triaged', value: automation?.aiTriaged ?? '—', accent: true },
            { label: 'Remediations Proposed', value: automation?.remediationsProposed ?? '—' },
            { label: 'Remediations Succeeded', value: automation?.remediationsSucceeded ?? '—' },
            { label: 'Success Rate', value: automation?.successRate != null ? `${automation.successRate}%` : '—' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="text-center p-3 rounded-lg border"
              style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}
            >
              <div className="text-xl font-bold" style={{ color: stat.accent ? 'hsl(265 85% 65%)' : 'hsl(var(--text-primary))' }}>
                {stat.value}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'hsl(var(--text-tertiary))' }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
