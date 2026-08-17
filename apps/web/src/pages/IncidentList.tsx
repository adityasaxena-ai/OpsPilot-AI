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

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isStatusPopoverOpen, setIsStatusPopoverOpen] = useState(false);
  const [isSeverityPopoverOpen, setIsSeverityPopoverOpen] = useState(false);
  const [isServicePopoverOpen, setIsServicePopoverOpen] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, severityFilter, serviceFilter, searchQuery, changeFilter]);

  const selectedStatusList = statusFilter
    ? statusFilter.split(',').map((s) => s.trim()).filter((s) => s && s !== 'ACTIVE' && s !== 'IMMEDIATE_ATTENTION')
    : [];

  const selectedSeverityList = severityFilter
    ? severityFilter.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const selectedServiceList = serviceFilter
    ? serviceFilter.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const toggleStatusOption = (statusOption: string) => {
    let nextList: string[] = [];
    if (selectedStatusList.includes(statusOption)) {
      nextList = selectedStatusList.filter((s) => s !== statusOption);
    } else {
      nextList = [...selectedStatusList, statusOption];
    }
    const nextParam = nextList.join(',');
    setStatusFilter(nextParam);
    const newParams = new URLSearchParams(searchParams);
    if (nextParam) newParams.set('status', nextParam);
    else newParams.delete('status');
    setSearchParams(newParams);
  };

  const toggleSeverityOption = (sevOption: string) => {
    let nextList: string[] = [];
    if (selectedSeverityList.includes(sevOption)) {
      nextList = selectedSeverityList.filter((s) => s !== sevOption);
    } else {
      nextList = [...selectedSeverityList, sevOption];
    }
    const nextParam = nextList.join(',');
    setSeverityFilter(nextParam);
    const newParams = new URLSearchParams(searchParams);
    if (nextParam) newParams.set('severity', nextParam);
    else newParams.delete('severity');
    setSearchParams(newParams);
  };

  const toggleServiceOption = (svcOption: string) => {
    let nextList: string[] = [];
    if (selectedServiceList.includes(svcOption)) {
      nextList = selectedServiceList.filter((s) => s !== svcOption);
    } else {
      nextList = [...selectedServiceList, svcOption];
    }
    const nextParam = nextList.join(',');
    setServiceFilter(nextParam);
    const newParams = new URLSearchParams(searchParams);
    if (nextParam) newParams.set('service', nextParam);
    else newParams.delete('service');
    setSearchParams(newParams);
  };

  const clearStatusFilter = () => {
    setStatusFilter('');
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('status');
    setSearchParams(newParams);
  };

  const clearSeverityFilter = () => {
    setSeverityFilter('');
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('severity');
    setSearchParams(newParams);
  };

  const clearServiceFilter = () => {
    setServiceFilter('');
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('service');
    setSearchParams(newParams);
  };

  const totalFilteredCount = incidents.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / pageSize));
  const paginatedIncidents = incidents.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-4 fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>
            Incidents
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'hsl(var(--text-tertiary))' }}>
            {total} total · showing {totalFilteredCount > 0 ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, totalFilteredCount)} of {totalFilteredCount} matching filters
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 relative">
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

          {/* Interactive Multi-Select Service Popover */}
          <div className="relative">
            <button
              onClick={() => {
                setIsServicePopoverOpen(!isServicePopoverOpen);
                setIsStatusPopoverOpen(false);
                setIsSeverityPopoverOpen(false);
              }}
              className="text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all"
              style={{
                background: serviceFilter ? 'hsl(220 90% 65% / 0.15)' : 'hsl(var(--bg-surface))',
                borderColor: serviceFilter ? 'hsl(220 90% 65% / 0.4)' : 'hsl(var(--border))',
                color: serviceFilter ? 'hsl(220 90% 75%)' : 'hsl(var(--text-secondary))',
              }}
              aria-label="Filter by Service Multi-Select"
            >
              <span>
                {selectedServiceList.length > 0
                  ? `Service (${selectedServiceList.length})`
                  : 'All Services'}
              </span>
              <ChevronRight size={12} className={`transition-transform ${isServicePopoverOpen ? 'rotate-90' : ''}`} />
            </button>

            {isServicePopoverOpen && (
              <div
                className="absolute left-0 sm:right-0 top-full mt-1.5 w-56 p-3 rounded-xl border shadow-xl z-50 space-y-2 fade-in"
                style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}
              >
                <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                  <span className="text-xs font-bold" style={{ color: 'hsl(var(--text-primary))' }}>Service Multi-Filter</span>
                  {serviceFilter && (
                    <button onClick={clearServiceFilter} className="text-[11px] text-indigo-400 hover:underline">
                      Clear All
                    </button>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 text-xs">
                  {uniqueServices.map((svc) => {
                    const isChecked = selectedServiceList.includes(svc);
                    return (
                      <label key={svc} className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-slate-800/50">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleServiceOption(svc)}
                          className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-[11px] text-slate-200 font-medium">{svc}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Interactive Multi-Select Status Popover */}
          <div className="relative">
            <button
              onClick={() => {
                setIsStatusPopoverOpen(!isStatusPopoverOpen);
                setIsServicePopoverOpen(false);
                setIsSeverityPopoverOpen(false);
              }}
              className="text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all"
              style={{
                background: statusFilter ? 'hsl(265 85% 65% / 0.15)' : 'hsl(var(--bg-surface))',
                borderColor: statusFilter ? 'hsl(265 85% 65% / 0.4)' : 'hsl(var(--border))',
                color: statusFilter ? 'hsl(265 85% 75%)' : 'hsl(var(--text-secondary))',
              }}
              aria-label="Filter by Incident Status Multi-Select"
            >
              <span>
                {statusFilter === 'ACTIVE'
                  ? 'Status: Active'
                  : statusFilter === 'IMMEDIATE_ATTENTION'
                  ? 'Status: Attention'
                  : selectedStatusList.length > 0
                  ? `Status (${selectedStatusList.length})`
                  : 'All Statuses'}
              </span>
              <ChevronRight size={12} className={`transition-transform ${isStatusPopoverOpen ? 'rotate-90' : ''}`} />
            </button>

            {isStatusPopoverOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 w-60 p-3 rounded-xl border shadow-xl z-50 space-y-2 fade-in"
                style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}
              >
                <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                  <span className="text-xs font-bold" style={{ color: 'hsl(var(--text-primary))' }}>Status Multi-Filter</span>
                  {statusFilter && (
                    <button onClick={clearStatusFilter} className="text-[11px] text-purple-400 hover:underline">
                      Clear All
                    </button>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 text-xs">
                  {STATUS_OPTIONS.filter(Boolean).map((st) => {
                    const isChecked = selectedStatusList.includes(st);
                    return (
                      <label key={st} className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-slate-800/50">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleStatusOption(st)}
                          className="rounded border-slate-700 text-purple-600 focus:ring-purple-500"
                        />
                        <span className="font-mono text-[11px]" style={{ color: STATUS_COLORS[st] ?? 'hsl(var(--text-secondary))' }}>
                          {st}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Interactive Multi-Select Severity Popover */}
          <div className="relative">
            <button
              onClick={() => {
                setIsSeverityPopoverOpen(!isSeverityPopoverOpen);
                setIsStatusPopoverOpen(false);
                setIsServicePopoverOpen(false);
              }}
              className="text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all"
              style={{
                background: severityFilter ? 'hsl(38 92% 50% / 0.15)' : 'hsl(var(--bg-surface))',
                borderColor: severityFilter ? 'hsl(38 92% 50% / 0.4)' : 'hsl(var(--border))',
                color: severityFilter ? 'hsl(38 92% 60%)' : 'hsl(var(--text-secondary))',
              }}
              aria-label="Filter by Severity Multi-Select"
            >
              <span>
                {selectedSeverityList.length > 0
                  ? `Severity (${selectedSeverityList.length})`
                  : 'All Severities'}
              </span>
              <ChevronRight size={12} className={`transition-transform ${isSeverityPopoverOpen ? 'rotate-90' : ''}`} />
            </button>

            {isSeverityPopoverOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 w-52 p-3 rounded-xl border shadow-xl z-50 space-y-2 fade-in"
                style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}
              >
                <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                  <span className="text-xs font-bold" style={{ color: 'hsl(var(--text-primary))' }}>Severity Multi-Filter</span>
                  {severityFilter && (
                    <button onClick={clearSeverityFilter} className="text-[11px] text-amber-400 hover:underline">
                      Clear All
                    </button>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 text-xs">
                  {['P1', 'P2', 'P3', 'P4'].map((sev) => {
                    const isChecked = selectedSeverityList.includes(sev);
                    return (
                      <label key={sev} className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-slate-800/50">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSeverityOption(sev)}
                          className="rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                        />
                        <span className="font-mono text-[11px] font-bold" style={{ color: severityColor(sev) }}>
                          {sev}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="block sm:hidden space-y-2.5">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 rounded-xl border skeleton h-20" />
          ))
        ) : paginatedIncidents.length === 0 ? (
          <div className="text-center py-12 border rounded-xl" style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}>
            <AlertTriangle size={32} className="mx-auto mb-3" style={{ color: 'hsl(var(--text-tertiary))' }} />
            <p style={{ color: 'hsl(var(--text-tertiary))' }}>No incidents found</p>
          </div>
        ) : (
          paginatedIncidents.map((inc) => (
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
                  <span className="text-xs font-semibold truncate max-w-[140px]" style={{ color: 'hsl(var(--text-primary))' }}>
                    {inc.service?.name}
                  </span>
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: `${STATUS_COLORS[inc.status] ?? 'hsl(var(--text-tertiary))'}1a`,
                    color: STATUS_COLORS[inc.status] ?? 'hsl(var(--text-tertiary))',
                  }}
                >
                  {inc.status}
                </span>
              </div>
              <p className="text-xs font-medium line-clamp-2" style={{ color: 'hsl(var(--text-primary))' }}>
                {inc.title}
              </p>
              <div className="flex items-center justify-between text-[11px] mt-2 pt-2 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
                <span style={{ color: 'hsl(var(--text-tertiary))' }}>{timeAgo(inc.detectedAt)}</span>
                <span style={{ color: 'hsl(220 90% 65%)' }} className="flex items-center gap-0.5">
                  View Detail <ChevronRight size={12} />
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <div
        className="hidden sm:block rounded-xl border overflow-hidden"
        style={{ borderColor: 'hsl(var(--border))' }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'hsl(var(--bg-surface-2))' }}>
              <th
                onClick={() => handleSort('severity')}
                className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-slate-800/40 transition-colors"
                style={{ color: 'hsl(var(--text-tertiary))' }}
              >
                <div className="flex items-center gap-1">
                  <span>Severity</span>
                  {sortColumn === 'severity' ? (sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="opacity-40" />}
                </div>
              </th>
              <th
                onClick={() => handleSort('title')}
                className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-slate-800/40 transition-colors"
                style={{ color: 'hsl(var(--text-tertiary))' }}
              >
                <div className="flex items-center gap-1">
                  <span>Title</span>
                  {sortColumn === 'title' ? (sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="opacity-40" />}
                </div>
              </th>
              <th
                onClick={() => handleSort('service')}
                className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-slate-800/40 transition-colors"
                style={{ color: 'hsl(var(--text-tertiary))' }}
              >
                <div className="flex items-center gap-1">
                  <span>Service</span>
                  {sortColumn === 'service' ? (sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="opacity-40" />}
                </div>
              </th>
              <th
                onClick={() => handleSort('status')}
                className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-slate-800/40 transition-colors"
                style={{ color: 'hsl(var(--text-tertiary))' }}
              >
                <div className="flex items-center gap-1">
                  <span>Status</span>
                  {sortColumn === 'status' ? (sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="opacity-40" />}
                </div>
              </th>
              <th
                onClick={() => handleSort('detectedAt')}
                className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-slate-800/40 transition-colors"
                style={{ color: 'hsl(var(--text-tertiary))' }}
              >
                <div className="flex items-center gap-1">
                  <span>Detected</span>
                  {sortColumn === 'detectedAt' ? (sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} className="opacity-40" />}
                </div>
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'hsl(var(--text-tertiary))' }}>
                Alerts
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderTop: '1px solid hsl(var(--border))' }}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="skeleton h-4 w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              : paginatedIncidents.length === 0
              ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <AlertTriangle size={32} className="mx-auto mb-3" style={{ color: 'hsl(var(--text-tertiary))' }} />
                    <p style={{ color: 'hsl(var(--text-tertiary))' }}>No incidents found</p>
                    <p className="text-xs mt-1" style={{ color: 'hsl(var(--text-tertiary))' }}>
                      Adjust filters or clear status selections
                    </p>
                  </td>
                </tr>
              )
              : paginatedIncidents.map((inc, i) => (
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

        <div
          className="p-3.5 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
          style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}
        >
          <div className="flex items-center gap-3" style={{ color: 'hsl(var(--text-tertiary))' }}>
            <span>
              Showing {totalFilteredCount > 0 ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, totalFilteredCount)} of{' '}
              <strong className="text-slate-200">{totalFilteredCount}</strong> matching incidents
            </span>
            <div className="flex items-center gap-1.5">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-200 outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1 font-mono text-xs">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2.5 py-1 rounded border border-slate-700 bg-slate-800 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700"
            >
              Previous
            </button>
            {Array.from({ length: totalPages }).map((_, idx) => {
              const pNum = idx + 1;
              return (
                <button
                  key={pNum}
                  onClick={() => setPage(pNum)}
                  className={`px-2.5 py-1 rounded border text-xs font-semibold ${
                    page === pNum
                      ? 'bg-purple-600 border-purple-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {pNum}
                </button>
              );
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2.5 py-1 rounded border border-slate-700 bg-slate-800 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
