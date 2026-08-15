import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Filter, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
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

const SEVERITY_RANKS: Record<string, number> = {
  P1: 1,
  P1_CRITICAL: 1,
  CRITICAL: 1,
  P2: 2,
  P3: 3,
  P4: 4,
  P5: 5,
};

type SortColumn = 'severity' | 'title' | 'service' | 'status' | 'detectedAt';
type SortDirection = 'asc' | 'desc';

export function IncidentList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialStatusParam = searchParams.get('status') ?? '';
  const initialChangeParam = searchParams.get('change') ?? '';
  const initialSeverityParam = searchParams.get('severity') ?? '';
  const initialServiceParam = searchParams.get('service') ?? '';

  const [statusFilter, setStatusFilter] = useState(initialStatusParam);
  const [severityFilter, setSeverityFilter] = useState(initialSeverityParam);
  const [serviceFilter, setServiceFilter] = useState(initialServiceParam);
  const [searchQuery, setSearchQuery] = useState('');
  const [changeFilter, setChangeFilter] = useState(initialChangeParam);

  const [sortColumn, setSortColumn] = useState<SortColumn>('severity');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  useEffect(() => {
    setStatusFilter(searchParams.get('status') ?? '');
    setSeverityFilter(searchParams.get('severity') ?? '');
    setServiceFilter(searchParams.get('service') ?? '');
    setChangeFilter(searchParams.get('change') ?? '');
  }, [searchParams]);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['incidents', { limit: '50' }],
    queryFn: () => api.incidents.list({ limit: '50' }),
    refetchInterval: 15_000,
  });

  const rawIncidents = (data?.data as Incident[] | undefined) ?? [];
  const total = (data?.meta as { total?: number } | undefined)?.total ?? 0;

  // Extract unique service names for the Service Filter dropdown
  const uniqueServices = Array.from(
    new Set(rawIncidents.map((i) => i.service?.name).filter(Boolean)),
  );

  // Filter incidents according to composable OR (within category) & AND (across categories) rules
  const filteredIncidents = rawIncidents.filter((inc) => {
    // 1. Service Filter
    if (serviceFilter && inc.service?.name !== serviceFilter && inc.service?.slug !== serviceFilter) {
      return false;
    }

    // 2. Special URL Preset Filter: ACTIVE
    if (statusFilter === 'ACTIVE') {
      if (inc.status === 'RESOLVED' || inc.status === 'CLOSED') return false;
    }
    // 3. Special URL Preset Filter: IMMEDIATE_ATTENTION
    else if (statusFilter === 'IMMEDIATE_ATTENTION') {
      const isHighSev = inc.severity === 'P1' || inc.severity === 'P2' || inc.severity.includes('CRITICAL');
      const isNotDone = inc.status !== 'RESOLVED' && inc.status !== 'CLOSED';
      if (!isHighSev || !isNotDone) return false;
    }
    // 4. Standard/Multi Status Filter
    else if (statusFilter) {
      const selectedStatuses = statusFilter.split(',').map((s) => s.trim()).filter(Boolean);
      if (selectedStatuses.length > 0 && !selectedStatuses.includes(inc.status)) {
        return false;
      }
    }

    // 5. Severity Filter
    if (severityFilter) {
      const selectedSeverities = severityFilter.split(',').map((s) => s.trim()).filter(Boolean);
      if (selectedSeverities.length > 0 && !selectedSeverities.some((s) => inc.severity.includes(s))) {
        return false;
      }
    }

    // 6. Correlated Change Group Filter
    if (changeFilter) {
      const q = changeFilter.toLowerCase();
      const matchTitle = inc.title.toLowerCase().includes('payment') || inc.service?.name?.toLowerCase().includes('payment');
      if (!matchTitle && !inc.title.toLowerCase().includes(q)) return false;
    }

    // 7. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        inc.title.toLowerCase().includes(q) ||
        inc.service?.name?.toLowerCase().includes(q) ||
        inc.id.toLowerCase().includes(q) ||
        inc.severity.toLowerCase().includes(q) ||
        inc.status.toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });

  // Sort incidents by underlying raw values
  const incidents = [...filteredIncidents].sort((a, b) => {
    let comparison = 0;
    if (sortColumn === 'severity') {
      const rankA = SEVERITY_RANKS[a.severity] ?? 99;
      const rankB = SEVERITY_RANKS[b.severity] ?? 99;
      comparison = rankA - rankB;
    } else if (sortColumn === 'title') {
      comparison = a.title.localeCompare(b.title);
    } else if (sortColumn === 'service') {
      comparison = (a.service?.name ?? '').localeCompare(b.service?.name ?? '');
    } else if (sortColumn === 'status') {
      comparison = a.status.localeCompare(b.status);
    } else if (sortColumn === 'detectedAt') {
      comparison = new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime();
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

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

        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Instant Search Input */}
          <div className="relative flex-1 sm:w-44">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'hsl(var(--text-tertiary))' }} />
            <input
              type="text"
              placeholder="Search incidents…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs pl-8 pr-3 py-1.5 rounded-lg border outline-none w-full focus:ring-1 focus:ring-indigo-500"
              style={{
                background: 'hsl(var(--bg-surface))',
                borderColor: 'hsl(var(--border))',
                color: 'hsl(var(--text-primary))',
              }}
              aria-label="Search incidents by title, service, or ID"
            />
          </div>

          <Filter size={14} style={{ color: 'hsl(var(--text-tertiary))' }} />
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border outline-none max-w-[130px]"
            style={{
              background: 'hsl(var(--bg-surface))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--text-secondary))',
            }}
            aria-label="Filter by Service"
          >
            <option value="">All Services</option>
            {uniqueServices.map((svc) => (
              <option key={svc} value={svc}>{svc}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border outline-none max-w-[130px]"
            style={{
              background: 'hsl(var(--bg-surface))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--text-secondary))',
            }}
            aria-label="Filter by Incident Status"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s || 'All Statuses'}</option>
            ))}
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border outline-none max-w-[130px]"
            style={{
              background: 'hsl(var(--bg-surface))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--text-secondary))',
            }}
            aria-label="Filter by Incident Severity"
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
              {[
                { label: 'Severity', col: 'severity' as SortColumn },
                { label: 'Title', col: 'title' as SortColumn },
                { label: 'Service', col: 'service' as SortColumn },
                { label: 'Status', col: 'status' as SortColumn },
                { label: 'Detected', col: 'detectedAt' as SortColumn },
                { label: 'Alerts', col: null },
              ].map(({ label, col }) => (
                <th
                  key={label}
                  onClick={() => col && handleSort(col)}
                  className={`text-left px-4 py-3 text-xs font-medium uppercase tracking-wider ${
                    col ? 'cursor-pointer select-none hover:text-indigo-400' : ''
                  }`}
                  style={{ color: col && sortColumn === col ? 'hsl(var(--text-primary))' : 'hsl(var(--text-tertiary))' }}
                >
                  <div className="flex items-center gap-1">
                    <span>{label}</span>
                    {col && (
                      <span className="text-[10px]">
                        {sortColumn === col ? (
                          sortDirection === 'asc' ? '▲' : '▼'
                        ) : (
                          <ArrowUpDown size={11} className="opacity-40" />
                        )}
                      </span>
                    )}
                  </div>
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
