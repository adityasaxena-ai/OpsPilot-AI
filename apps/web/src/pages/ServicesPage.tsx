import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Server, Activity } from 'lucide-react';
import { api } from '@/lib/api';

interface Service {
  id: string;
  name: string;
  slug: string;
  tier: string;
  status: string;
  healthScore: number;
  ownerTeam: string;
  _count: { incidents: number; alerts: number };
  simState: {
    cpuPercent: number;
    errorRatePercent: number;
    latencyP99Ms: number;
    isHealthy: boolean;
    failureScenario: string | null;
  } | null;
}

const STATUS_COLORS: Record<string, string> = {
  HEALTHY: 'hsl(142 72% 45%)',
  DEGRADED: 'hsl(38 92% 50%)',
  DOWN: 'hsl(0 85% 55%)',
  MAINTENANCE: 'hsl(200 80% 57%)',
  UNKNOWN: 'hsl(220 14% 55%)',
};

export function ServicesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => api.services.list(),
    refetchInterval: 15_000,
  });

  const services = (data?.data as Service[] | undefined) ?? [];
  const t1 = services.filter((s) => s.tier === 'T1');
  const t2 = services.filter((s) => s.tier === 'T2');
  const t3Plus = services.filter((s) => s.tier !== 'T1' && s.tier !== 'T2');

  const TierSection = ({ label, items }: { label: string; items: Service[] }) => (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'hsl(var(--text-tertiary))' }}>
        {label}
      </h2>
      <div className="grid grid-cols-3 gap-3">
        {items.map((svc) => {
          const color = STATUS_COLORS[svc.status] ?? 'hsl(var(--text-tertiary))';
          return (
            <Link
              key={svc.id}
              to={`/services/${svc.id}`}
              className="block rounded-xl border p-4 transition-all hover:opacity-80 fade-in"
              style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="font-medium text-sm" style={{ color: 'hsl(var(--text-primary))' }}>
                    {svc.name}
                  </span>
                </div>
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: 'hsl(var(--bg-surface-3))', color: 'hsl(var(--text-tertiary))' }}
                >
                  {svc.tier}
                </span>
              </div>

              {svc.simState && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { l: 'CPU', v: `${Math.round(svc.simState.cpuPercent)}%`, warn: svc.simState.cpuPercent > 85 },
                    { l: 'ERR', v: `${svc.simState.errorRatePercent.toFixed(1)}%`, warn: svc.simState.errorRatePercent > 5 },
                    { l: 'P99', v: `${Math.round(svc.simState.latencyP99Ms)}ms`, warn: svc.simState.latencyP99Ms > 2000 },
                  ].map((m) => (
                    <div key={m.l} className="text-center">
                      <div className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>{m.l}</div>
                      <div
                        className="text-xs font-mono font-medium mt-0.5"
                        style={{
                          color: m.warn ? 'hsl(0 85% 65%)' : 'hsl(var(--text-secondary))',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {m.v}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>
                <span>{svc.ownerTeam}</span>
                <span style={{ color }}>
                  {svc.simState?.failureScenario?.replace(/_/g, ' ') ?? svc.status}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="skeleton h-36 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-in">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>Services</h1>
        <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--text-tertiary))' }}>
          {services.length} monitored services · tier-based dependency mapping
        </p>
      </div>

      {t1.length > 0 && <TierSection label="Tier 1 — Critical (P1 Impact)" items={t1} />}
      {t2.length > 0 && <TierSection label="Tier 2 — Important (P2-P3 Impact)" items={t2} />}
      {t3Plus.length > 0 && <TierSection label="Tier 3+ — Supporting" items={t3Plus} />}
    </div>
  );
}
