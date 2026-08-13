import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Filter } from 'lucide-react';
import { api } from '@/lib/api';
import { severityColor, timeAgo } from '@/lib/utils';

interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
  detectedAt: string;
  service: { name: string; slug: string };
  _count: { alertGroups: number };
}

const STATUS_OPTIONS = [
  '',
  'DETECTED',
  'TRIAGED',
  'CORRELATED',
  'INVESTIGATING',
  'RCA_IDENTIFIED',
  'REMEDIATION_PROPOSED',
  'AWAITING_APPROVAL',
  'REMEDIATION_APPROVED',
  'REMEDIATION_EXECUTED',
  'EXECUTING',
  'VERIFYING',
  'RESOLVED',
  'CLOSED',
  'FAILED',
  'ESCALATED',
  'LEARNING',
];
const SEVERITY_OPTIONS = ['', 'P1', 'P2', 'P3', 'P4', 'P5'];

const STATUS_COLORS: Record<string, string> = {
  DETECTED: 'hsl(0 85% 65%)',
  TRIAGED: 'hsl(25 95% 60%)',
  CORRELATED: 'hsl(48 95% 58%)',
  INVESTIGATING: 'hsl(265 85% 65%)',
  RCA_IDENTIFIED: 'hsl(200 80% 57%)',
  REMEDIATION_PROPOSED: 'hsl(160 60% 55%)',
  AWAITING_APPROVAL: 'hsl(38 92% 50%)',
  REMEDIATION_APPROVED: 'hsl(142 72% 45%)',
  REMEDIATION_EXECUTED: 'hsl(220 90% 60%)',
  EXECUTING: 'hsl(220 90% 60%)',
  VERIFYING: 'hsl(200 80% 57%)',
  RESOLVED: 'hsl(142 72% 45%)',
  CLOSED: 'hsl(215 20% 50%)',
  FAILED: 'hsl(0 85% 55%)',
  ESCALATED: 'hsl(0 90% 60%)',
  LEARNING: 'hsl(280 75% 60%)',
};

export function IncidentList() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['incidents', { status: statusFilter, severity: severityFilter }],
    queryFn: () =>
      api.incidents.list({
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(severityFilter ? { severity: severityFilter } : {}),
        limit: '50',
      }),
    refetchInterval: 15_000,
  });

  const incidents = (data?.data as Incident[] | undefined) ?? [];
  const total = (data?.meta as { total?: number } | undefined)?.total ?? 0;

  return (
    <div className="space-y-4 fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>
            Incidents
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--text-tertiary))' }}>
            {total} total · auto-correlated from alerts
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={14} style={{ color: 'hsl(var(--text-tertiary))' }} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-lg border outline-none"
            style={{
              background: 'hsl(var(--bg-surface))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--text-secondary))',
            }}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s || 'All Statuses'}</option>
            ))}
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-lg border outline-none"
            style={{
              background: 'hsl(var(--bg-surface))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--text-secondary))',
            }}
          >
            {SEVERITY_OPTIONS.map((s) => (
              <option key={s} value={s}>{s || 'All Severities'}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Mobile Card List View (sm:hidden) */}
      <div className="block sm:hidden space-y-2.5">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 rounded-xl border skeleton h-20" />
          ))
        ) : incidents.length === 0 ? (
          <div className="text-center py-12 border rounded-xl" style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}>
            <AlertTriangle size={32} className="mx-auto mb-3" style={{ color: 'hsl(var(--text-tertiary))' }} />
            <p style={{ color: 'hsl(var(--text-tertiary))' }}>No incidents found</p>
          </div>
        ) : (
          incidents.map((inc) => (
            <div
              key={inc.id}
              onClick={() => navigate(`/incidents/${inc.id}`)}
              className="p-3.5 rounded-xl border transition-all hover:opacity-90 active:scale-[0.99] cursor-pointer"
              style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="font-bold text-xs px-2 py-0.5 rounded"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      background: `${severityColor(inc.severity)}1a`,
                      color: severityColor(inc.severity),
                    }}
                  >
                    {inc.severity}
                  </span>
                  <span className="text-xs font-medium" style={{ color: 'hsl(var(--text-secondary))' }}>
                    {inc.service?.name}
                  </span>
                </div>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: `${STATUS_COLORS[inc.status] ?? 'hsl(var(--text-tertiary))'}1a`,
                    color: STATUS_COLORS[inc.status] ?? 'hsl(var(--text-tertiary))',
                  }}
                >
                  {inc.status}
                </span>
              </div>
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'hsl(var(--text-primary))' }}>
                {inc.title}
              </h3>
              <div className="flex items-center justify-between text-xs mt-2" style={{ color: 'hsl(var(--text-tertiary))' }}>
                <span>{timeAgo(inc.detectedAt)}</span>
                <span className="flex items-center gap-1 text-indigo-400 font-medium">
                  Investigate <ChevronRight size={12} />
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop/Tablet Table View (hidden sm:block) */}
      <div
        className="hidden sm:block rounded-xl border overflow-x-auto"
        style={{ borderColor: 'hsl(var(--border))' }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'hsl(var(--bg-surface-2))' }}>
              {['Severity', 'Title', 'Service', 'Status', 'Detected', 'Alerts'].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider"
                  style={{ color: 'hsl(var(--text-tertiary))' }}
                >
                  {h}
                </th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderTop: '1px solid hsl(var(--border))' }}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="skeleton h-4 w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              : incidents.length === 0
              ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <AlertTriangle size={32} className="mx-auto mb-3" style={{ color: 'hsl(var(--text-tertiary))' }} />
                    <p style={{ color: 'hsl(var(--text-tertiary))' }}>No incidents found</p>
                    <p className="text-xs mt-1" style={{ color: 'hsl(var(--text-tertiary))' }}>
                      Go to Chaos Lab to inject a failure and trigger incidents
                    </p>
                  </td>
                </tr>
              )
              : incidents.map((inc, i) => (
                <tr
                  key={inc.id}
                  onClick={() => navigate(`/incidents/${inc.id}`)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/incidents/${inc.id}`);
                    }
                  }}
                  className="cursor-pointer hover:opacity-80 transition-opacity focus:outline-none focus:ring-1 focus:ring-blue-500"
                  style={{
                    background: i % 2 === 0 ? 'hsl(var(--bg-surface))' : 'hsl(var(--bg-surface-2))',
                    borderTop: '1px solid hsl(var(--border))',
                  }}
                >
                  <td className="px-4 py-3">
                    <span
                      className="font-bold text-xs px-2 py-0.5 rounded"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        background: `${severityColor(inc.severity)}1a`,
                        color: severityColor(inc.severity),
                      }}
                    >
                      {inc.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <span className="font-medium truncate block" style={{ color: 'hsl(var(--text-primary))' }}>
                      {inc.title}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span style={{ color: 'hsl(var(--text-secondary))' }}>{inc.service?.name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: `${STATUS_COLORS[inc.status] ?? 'hsl(var(--text-tertiary))'}1a`,
                        color: STATUS_COLORS[inc.status] ?? 'hsl(var(--text-tertiary))',
                      }}
                    >
                      {inc.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span style={{ color: 'hsl(var(--text-tertiary))' }}>{timeAgo(inc.detectedAt)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span style={{ color: 'hsl(var(--text-tertiary))' }}>{inc._count?.alertGroups ?? 0}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/incidents/${inc.id}`}
                      className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
                      style={{ color: 'hsl(220 90% 65%)' }}
                    >
                      View <ChevronRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
