import { useState, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Activity, User, Cpu, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/utils';

interface AuditEntry {
  id: string;
  action: string;
  actorType: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  actor: { name: string; email: string } | null;
}

const ACTOR_ICONS: Record<string, React.ElementType> = {
  AI: Activity,
  USER: User,
  SYSTEM: Cpu,
};

export function AuditLog() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['audit'],
    queryFn: () => api.audit.list({ limit: '100' }),
    refetchInterval: 15_000,
  });

  const logs = (data?.data as AuditEntry[] | undefined) ?? [];
  const total = (data?.meta as { total?: number } | undefined)?.total ?? 0;

  return (
    <div className="space-y-4 fade-in">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>
          Audit Log
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--text-tertiary))' }}>
          {total} entries · immutable operational trail — click any row to expand event details
        </p>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: 'hsl(var(--border))' }}
      >
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardList size={32} className="mx-auto mb-3" style={{ color: 'hsl(var(--text-tertiary))' }} />
            <p style={{ color: 'hsl(var(--text-tertiary))' }}>No audit log entries yet</p>
            <p className="text-xs mt-1" style={{ color: 'hsl(var(--text-tertiary))' }}>
              Events are recorded as incidents are created and updated
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'hsl(var(--bg-surface-2))' }}>
                {['Time', 'Actor', 'Action', 'Resource', 'Details'].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider"
                    style={{ color: 'hsl(var(--text-tertiary))' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((entry, i) => {
                const Icon = ACTOR_ICONS[entry.actorType] ?? Activity;
                const isExpanded = expandedId === entry.id;
                return (
                  <Fragment key={entry.id}>
                    <tr
                      tabIndex={0}
                      role="button"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedId(isExpanded ? null : entry.id);
                        } else if (e.key === 'Escape') {
                          setExpandedId(null);
                        }
                      }}
                      className="cursor-pointer transition-colors hover:bg-slate-800/40 outline-none focus:bg-slate-800/50"
                      style={{
                        background: isExpanded
                          ? 'hsl(265 85% 65% / 0.08)'
                          : i % 2 === 0
                          ? 'hsl(var(--bg-surface))'
                          : 'hsl(var(--bg-surface-2))',
                        borderTop: '1px solid hsl(var(--border))',
                      }}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-medium" style={{ color: 'hsl(var(--text-tertiary))' }}>
                          {timeAgo(entry.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Icon
                            size={12}
                            style={{
                              color: entry.actorType === 'AI'
                                ? 'hsl(265 85% 65%)'
                                : 'hsl(var(--text-tertiary))',
                            }}
                          />
                          <span className="text-xs" style={{ color: 'hsl(var(--text-secondary))' }}>
                            {entry.actor?.name ?? entry.actorType}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="text-xs font-mono px-2 py-0.5 rounded"
                          style={{
                            background: 'hsl(var(--bg-surface-3))',
                            color: 'hsl(var(--text-secondary))',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>
                          {entry.resourceType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs truncate max-w-xs block" style={{ color: 'hsl(var(--text-tertiary))' }}>
                            {JSON.stringify(entry.metadata ?? {}).substring(0, 70)}
                          </span>
                          {isExpanded ? <ChevronUp size={14} className="text-purple-400 shrink-0" /> : <ChevronDown size={14} className="text-slate-500 shrink-0" />}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-950/70 border-t border-purple-500/30">
                        <td colSpan={5} className="p-4 space-y-3">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div>
                              <span className="text-slate-400 block text-[11px]">Exact Timestamp</span>
                              <span className="font-mono text-slate-200 font-semibold">{new Date(entry.createdAt).toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">Actor / Source</span>
                              <span className="text-slate-200 font-semibold">{entry.actor?.name ?? entry.actorType} ({entry.actor?.email ?? entry.actorType})</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">Resource Entity</span>
                              <span className="font-mono text-indigo-300 font-semibold">{entry.resourceType} ({entry.resourceId.substring(0, 12)}…)</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">Action Type</span>
                              <span className="font-mono text-purple-300 font-semibold">{entry.action}</span>
                            </div>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px] mb-1">Full Event Metadata</span>
                            <pre className="font-mono text-[11px] p-3 rounded-lg bg-slate-950 text-indigo-200 border border-slate-800 overflow-x-auto">
                              {JSON.stringify(entry.metadata ?? {}, null, 2)}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
