import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { severityColor, timeAgo } from '@/lib/utils';

interface Alert {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  service: { name: string; slug: string };
  fingerprint: string;
}

export function AlertFeed() {
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', { status: statusFilter }],
    queryFn: () => api.alerts.list({ ...(statusFilter ? { status: statusFilter } : {}), limit: '100' }),
    refetchInterval: 10_000,
  });

  const [ackError, setAckError] = useState<string | null>(null);

  const ackMutation = useMutation({
    mutationFn: (id: string) => api.alerts.update(id, { status: 'ACKNOWLEDGED' }),
    onSuccess: () => {
      setAckError(null);
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (err: any) => {
      setAckError(err?.message || err?.error?.message || 'Failed to acknowledge alert.');
    },
  });

  const alerts = Array.isArray(data?.data) ? (data.data as Alert[]) : [];

  const total = (data?.meta as { total?: number } | undefined)?.total ?? 0;

  return (
    <div className="space-y-4 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>
            Alert Feed
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--text-tertiary))' }}>
            {total} alerts · deduplication + correlation active
          </p>
        </div>
        <div className="flex items-center gap-2">
          {['', 'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="text-xs px-3 py-1.5 rounded-lg border transition-all"
              style={{
                background: statusFilter === s ? 'hsl(220 90% 56% / 0.15)' : 'hsl(var(--bg-surface))',
                borderColor: statusFilter === s ? 'hsl(220 90% 56% / 0.3)' : 'hsl(var(--border))',
                color: statusFilter === s ? 'hsl(220 90% 70%)' : 'hsl(var(--text-secondary))',
              }}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-20 w-full rounded-xl" />
            ))
          : alerts.length === 0
          ? (
            <div className="text-center py-16 rounded-xl border" style={{ borderColor: 'hsl(var(--border))' }}>
              <Bell size={32} className="mx-auto mb-3" style={{ color: 'hsl(var(--text-tertiary))' }} />
              <p style={{ color: 'hsl(var(--text-tertiary))' }}>No alerts matching filter</p>
            </div>
          )
          : alerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-center gap-4 px-4 py-3 rounded-xl border fade-in"
              style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
            >
              {/* Severity stripe */}
              <div
                className="w-1 h-10 rounded-full flex-none"
                style={{ background: severityColor(alert.severity) }}
              />

              {/* Main content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      background: `${severityColor(alert.severity)}1a`,
                      color: severityColor(alert.severity),
                    }}
                  >
                    {alert.severity}
                  </span>
                  <span className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>
                    {alert.service?.name}
                  </span>
                  {alert.occurrenceCount > 1 && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full"
                      style={{ background: 'hsl(var(--bg-surface-3))', color: 'hsl(var(--text-tertiary))' }}
                    >
                      ×{alert.occurrenceCount}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium truncate" style={{ color: 'hsl(var(--text-primary))' }}>
                  {alert.title}
                </p>
                <p className="text-xs truncate mt-0.5" style={{ color: 'hsl(var(--text-secondary))' }}>
                  {alert.description}
                </p>
              </div>

              {/* Right */}
              <div className="text-right flex-none">
                <p className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>
                  {timeAgo(alert.lastSeenAt)}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--text-tertiary))' }}>
                  {alert.status}
                </p>
              </div>

              {/* Ack button */}
              {alert.status === 'ACTIVE' && (
                <button
                  onClick={() => ackMutation.mutate(alert.id)}
                  disabled={ackMutation.isPending}
                  className="ml-2 p-1.5 rounded-lg border transition-all hover:opacity-80 flex-none"
                  title="Acknowledge"
                  style={{
                    background: 'hsl(var(--bg-surface-2))',
                    borderColor: 'hsl(var(--border))',
                  }}
                >
                  <CheckCircle size={14} style={{ color: 'hsl(142 72% 45%)' }} />
                </button>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
