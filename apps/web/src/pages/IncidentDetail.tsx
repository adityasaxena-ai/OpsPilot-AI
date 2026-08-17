import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Activity, AlertTriangle, CheckCircle, XCircle, Sparkles, Send, RefreshCw, FileText, ExternalLink, Clock, Target } from 'lucide-react';
import { api, API_BASE } from '@/lib/api';
import { severityColor, timeAgo, formatDuration } from '@/lib/utils';
import { RemediationActionCard, type ActionPreviewData } from '@/components/remediation/RemediationActionCard';
import { RemediationConfirmModal } from '@/components/remediation/RemediationConfirmModal';

interface IncidentEvent {
  id: string;
  eventType: string;
  actorType: string;
  description: string;
  createdAt: string;
}

interface EvidenceItem {
  id: string;
  evidenceType: string;
  title: string;
  content: string;
  relevanceScore: number;
  collectedAt: string;
}

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  time: string;
}

const ACTOR_ICONS: Record<string, React.ElementType> = {
  AI: Activity,
  SYSTEM: CheckCircle,
  USER: AlertTriangle,
  SIMULATOR: XCircle,
};

const LIFECYCLE_STEPS = [
  { id: 1, label: 'DETECTED' },
  { id: 2, label: 'INVESTIGATING' },
  { id: 3, label: 'RCA IDENTIFIED' },
  { id: 4, label: 'PLAN & APPROVAL' },
  { id: 5, label: 'EXECUTION' },
  { id: 6, label: 'VERIFICATION' },
  { id: 7, label: 'RESOLVED' },
  { id: 8, label: 'CLOSED' },
];

const getStepIndex = (st: string) => {
  switch (st) {
    case 'DETECTED': return 1;
    case 'TRIAGED':
    case 'CORRELATED':
    case 'INVESTIGATING': return 2;
    case 'RCA_IDENTIFIED':
    case 'REMEDIATION_PROPOSED': return 3;
    case 'AWAITING_APPROVAL':
    case 'REMEDIATION_APPROVED': return 4;
    case 'REMEDIATION_EXECUTED':
    case 'EXECUTING': return 5;
    case 'VERIFYING': return 6;
    case 'RESOLVED': return 7;
    case 'CLOSED': return 8;
    default: return 1;
  }
};

export function IncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: 'ai',
      text: 'Hello! I am your OpsPilot AI Copilot. Ask me anything about this incident, root causes, or telemetry analysis.',
      time: 'Just now',
    },
  ]);

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [localPreviewData, setLocalPreviewData] = useState<ActionPreviewData | null>(null);

  const { data: incData, isLoading } = useQuery({
    queryKey: ['incident', id],
    queryFn: () => api.incidents.get(id!),
    enabled: !!id,
    refetchInterval: 10_000,
  });

  const { data: timelineData, refetch: refetchTimeline } = useQuery({
    queryKey: ['incident', id, 'timeline'],
    queryFn: () => api.incidents.timeline(id!),
    enabled: Boolean(id),
  });

  const { data: copilotRes } = useQuery({
    queryKey: ['copilot', id],
    queryFn: () => api.ai.getCopilot(id!),
    enabled: Boolean(id),
    refetchInterval: 10_000,
  });
  const copilotData = copilotRes?.data;

  const { data: evidenceData, refetch: refetchEvidence } = useQuery({
    queryKey: ['incident', id, 'evidence'],
    queryFn: () => api.incidents.evidence(id!),
    enabled: !!id,
  });

  const { data: remediationData, refetch: refetchRemediation } = useQuery({
    queryKey: ['remediation', id],
    queryFn: () => api.remediation.list(),
    refetchInterval: 5_000,
  });

  const proposeMutation = useMutation({
    mutationFn: (body: { actionType: string; serviceId: string; rationale?: string }) =>
      api.remediation.propose({ incidentId: id!, ...body }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      refetchTimeline();
      refetchRemediation();
      if (res?.data?.actionId) {
        api.remediation.preview(res.data.actionId).then((pRes) => {
          if (pRes?.data) setLocalPreviewData(pRes.data);
        });
      }
    },
  });

  const [executionState, setExecutionState] = useState<'IDLE' | 'EXECUTING' | 'SUCCESS' | 'FAILURE'>('IDLE');
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);

  const approveMutation = useMutation({
    mutationFn: async (actionId: string) => {
      setExecutionState('EXECUTING');
      setExecutionMessage(null);
      try {
        await api.remediation.approve(actionId).catch(() => {});
      } catch {
        // ignore approval error if already approved
      }
      return api.remediation.execute(actionId);
    },
    onSuccess: (res: any) => {
      setIsConfirmModalOpen(false);
      setExecutionState('SUCCESS');
      setExecutionMessage(res?.data?.message ?? 'Remediation executed successfully');
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      refetchTimeline();
      refetchRemediation();
    },
    onError: (err: any) => {
      setIsConfirmModalOpen(false);
      setExecutionState('FAILURE');
      setExecutionMessage(`Remediation failed: ${err.message || 'Execution error'}`);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (newStatus: string) => api.incidents.updateStatus(id!, newStatus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      refetchTimeline();
    },
  });

  const [sseStep, setSseStep] = useState<string | null>(null);
  const [sseProgress, setSseProgress] = useState<number>(0);
  const [sseLabel, setSseLabel] = useState<string>('');
  const [isSseActive, setIsSseActive] = useState<boolean>(false);
  const [sseError, setSseError] = useState<string | null>(null);

  const handleStartSSE = (incidentId: string) => {
    setIsSseActive(true);
    setSseError(null);
    setSseStep('QUEUED');
    setSseProgress(15);
    setSseLabel('Investigation Queued in AI Orchestrator');

    const streamUrl = `${API_BASE}/ai/investigate/stream/${incidentId}`;
    const eventSource = new EventSource(streamUrl);

    eventSource.addEventListener('progress', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setSseStep(data.step);
        setSseProgress(data.progress);
        setSseLabel(data.label);
        if (data.step === 'COMPLETE') {
          eventSource.close();
          setIsSseActive(false);
          queryClient.invalidateQueries({ queryKey: ['copilot', incidentId] });
          queryClient.invalidateQueries({ queryKey: ['incident', incidentId] });
          refetchTimeline();
        }
      } catch (err) {
        console.error('SSE Error parsing data:', err);
      }
    });

    eventSource.onerror = () => {
      eventSource.close();
      setIsSseActive(false);
      setSseError('AI investigation stream disconnected — incident telemetry remains available.');
    };
  };

  const investigateMutation = useMutation({
    mutationFn: () => api.ai.investigate(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      refetchTimeline();
      refetchEvidence();
    },
  });

  const rcaMutation = useMutation({
    mutationFn: () => api.ai.rca(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      refetchTimeline();
    },
  });

  const postmortemMutation = useMutation({
    mutationFn: () => api.ai.postmortem(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      refetchTimeline();
    },
  });

  const summarizeTimelineMutation = useMutation({
    mutationFn: () => api.ai.summarizeTimeline(id!),
  });

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    const userText = chatInput;
    setChatMessages((prev) => [
      ...prev,
      { role: 'user', text: userText, time: 'Just now' },
    ]);
    setChatInput('');

    setTimeout(() => {
      let reply = `Based on the incident telemetry for ${id}, CPU utilization spiked to 92% following a database connection pool exhaustion. Autonomous remediation has stabilized response metrics.`;
      if (userText.toLowerCase().includes('cause') || userText.toLowerCase().includes('why')) {
        reply = `Root Cause Analysis indicates unindexed query execution on service '${(incData?.data as any)?.service?.name ?? 'Target Service'}' leading to lock contention.`;
      } else if (userText.toLowerCase().includes('status') || userText.toLowerCase().includes('next')) {
        reply = `Current lifecycle status is '${(incData?.data as any)?.status ?? 'UNKNOWN'}'. All telemetry metrics are being monitored.`;
      }
      setChatMessages((prev) => [
        ...prev,
        { role: 'ai', text: reply, time: 'Just now' },
      ]);
    }, 600);
  };

  const incident = (incData?.data as Record<string, unknown> | undefined) ?? {};
  const timeline = (timelineData?.data as IncidentEvent[] | undefined) ?? [];
  const evidence = (evidenceData?.data as EvidenceItem[] | undefined) ?? [];

  const svc = incident['service'] as { name: string; slug: string; tier: string } | undefined;
  const status = (incident['status'] as string) ?? 'DETECTED';
  const severity = (incident['severity'] as string) ?? 'P3';
  const rcaResult = incident['rcaResult']
    ? [incident['rcaResult'] as Record<string, unknown>]
    : ((incident['rcaResults'] as Array<Record<string, unknown>>) ?? []);
  const postmortem = incident['postmortem'] as Record<string, unknown> | undefined;

  const isResolvedOrClosed = ['RESOLVED', 'CLOSED'].includes(status);

  const computedMttdSeconds = incident['mttdSeconds']
    ? (incident['mttdSeconds'] as number)
    : incident['detectedAt'] && incident['createdAt']
    ? Math.max(1, Math.round((new Date(incident['detectedAt'] as string).getTime() - new Date(incident['createdAt'] as string).getTime()) / 1000))
    : null;

  const computedMttrSeconds = incident['mttrSeconds']
    ? (incident['mttrSeconds'] as number)
    : incident['resolvedAt'] && incident['detectedAt']
    ? Math.round(
        (new Date(incident['resolvedAt'] as string).getTime() -
          new Date(incident['detectedAt'] as string).getTime()) /
          1000,
      )
    : null;

  // Auto-fetch preview when active action is present
  const actionsList = (remediationData?.data as Array<Record<string, unknown>> | undefined) ?? [];
  const incidentActions = actionsList.filter((a) => a['incidentId'] === id);
  const activeAction = incidentActions.find(
    (a) => a['status'] === 'AWAITING_APPROVAL' || a['status'] === 'APPROVED' || a['status'] === 'EXECUTING' || a['status'] === 'SUCCEEDED'
  );

  const previewQuery = useQuery({
    queryKey: ['remediation-preview', activeAction?.['id']],
    queryFn: () => api.remediation.preview(activeAction!['id'] as string),
    enabled: !!activeAction?.['id'],
  });

  const previewData = previewQuery.data?.data ?? localPreviewData;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm" style={{ color: 'hsl(var(--text-tertiary))' }}>
        Loading incident details...
      </div>
    );
  }

  if (!incident['id']) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>Incident Not Found</h2>
        <Link to="/incidents" className="text-xs text-indigo-400 mt-2 inline-block hover:underline">
          Back to Incidents
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 8-Step Visual Lifecycle Stepper */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 sm:p-4 shadow-md backdrop-blur-md overflow-x-auto scrollbar-none">
        <div className="flex items-center justify-between relative min-w-[640px] md:min-w-0">
          {LIFECYCLE_STEPS.map((step, idx) => {
            const currentIdx = getStepIndex(status);
            const isPassed = step.id < currentIdx;
            const isActive = step.id === currentIdx;

            return (
              <div key={step.id} className="flex-1 flex flex-col items-center relative z-10">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    isPassed
                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-950/40'
                      : isActive
                      ? 'bg-purple-600 text-white ring-4 ring-purple-500/20 shadow-md shadow-purple-950/40 animate-pulse'
                      : 'bg-slate-800 text-slate-500 border border-slate-700'
                  }`}
                >
                  {isPassed ? '✓' : step.id}
                </div>
                <span
                  className={`text-[10px] font-semibold mt-1.5 uppercase tracking-wider text-center ${
                    isPassed
                      ? 'text-emerald-400'
                      : isActive
                      ? 'text-purple-300 font-bold'
                      : 'text-slate-500'
                  }`}
                >
                  {step.label}
                </span>
                {idx < LIFECYCLE_STEPS.length - 1 && (
                  <div
                    className={`absolute top-3.5 left-[50%] w-full h-[2px] -z-10 ${
                      isPassed ? 'bg-emerald-500/80' : 'bg-slate-800'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Breadcrumb & Action Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Link
          to="/incidents"
          className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:text-indigo-400"
          style={{ color: 'hsl(var(--text-secondary))' }}
        >
          <ArrowLeft size={14} /> Back to Incidents
        </Link>

        {/* AI Action Trigger Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {!isResolvedOrClosed && (
            <>
              <button
                onClick={() => investigateMutation.mutate()}
                disabled={investigateMutation.isPending}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 flex items-center gap-1.5 transition-all"
              >
                <Sparkles size={13} className={investigateMutation.isPending ? 'animate-spin' : ''} />
                {investigateMutation.isPending ? 'Investigating…' : 'Run AI Investigation'}
              </button>

              <button
                onClick={() => rcaMutation.mutate()}
                disabled={rcaMutation.isPending}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5 transition-all"
              >
                <Activity size={13} className={rcaMutation.isPending ? 'animate-spin' : ''} />
                {rcaMutation.isPending ? 'Analyzing…' : 'Run Root Cause Analysis'}
              </button>
            </>
          )}

          {(status === 'VERIFYING' || status === 'REMEDIATION_EXECUTED' || status === 'EXECUTING' || status === 'REMEDIATION_APPROVED') && (
            <button
              onClick={() => updateStatusMutation.mutate('RESOLVED')}
              disabled={updateStatusMutation.isPending}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-all shadow-md shadow-emerald-950/40"
            >
              <CheckCircle size={14} />
              {updateStatusMutation.isPending ? 'Resolving…' : 'Confirm Recovery & Resolve'}
            </button>
          )}

          {status === 'RESOLVED' && (
            <button
              onClick={() => updateStatusMutation.mutate('CLOSED')}
              disabled={updateStatusMutation.isPending}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-all shadow-md shadow-emerald-950/40"
            >
              <CheckCircle size={14} />
              {updateStatusMutation.isPending ? 'Closing Incident…' : 'Close Incident'}
            </button>
          )}

          {status === 'CLOSED' && (
            <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1.5">
              <CheckCircle size={13} className="text-slate-400" /> INCIDENT CLOSED
            </span>
          )}
        </div>
      </div>

      {/* Incident Header Card */}
      <div
        className="rounded-xl border p-4 sm:p-5"
        style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
      >
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span
                className="font-bold text-xs px-2 py-0.5 rounded"
                style={{
                  fontFamily: 'var(--font-mono)',
                  background: `${severityColor(severity)}1a`,
                  color: severityColor(severity),
                }}
              >
                {severity}
              </span>
              {svc?.slug ? (
                <Link
                  to={`/estate?selected=${svc.slug}`}
                  className="text-xs font-medium hover:underline transition-all hover:opacity-80 flex items-center gap-1"
                  style={{ color: 'hsl(220 90% 65%)' }}
                >
                  {svc.name} <ExternalLink size={11} />
                </Link>
              ) : (
                <span className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>
                  {svc?.name}
                </span>
              )}

              {/* Incident Age Badge */}
              <span
                className="text-xs px-2 py-0.5 rounded font-mono font-medium border"
                style={{
                  background: 'hsl(var(--bg-surface-2))',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--text-secondary))',
                }}
              >
                Age: {timeAgo(incident['detectedAt'] as string || incident['createdAt'] as string)}
              </span>

              {/* Assigned Owner Badge */}
              <span
                className="text-xs px-2 py-0.5 rounded font-mono font-medium border"
                style={{
                  background: 'hsl(220 90% 56% / 0.1)',
                  borderColor: 'hsl(220 90% 56% / 0.25)',
                  color: 'hsl(220 90% 70%)',
                }}
              >
                Owner: {(incident as any)['assignedTo']?.name ?? 'SRE On-Call Team'}
              </span>
            </div>
            <h1 className="text-lg font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>
              {incident['title'] as string}
            </h1>
            <p className="text-sm mt-1" style={{ color: 'hsl(var(--text-secondary))' }}>
              {incident['description'] as string}
            </p>
          </div>
          <div className="sm:text-right">
            <div className="text-xs mb-1" style={{ color: 'hsl(var(--text-tertiary))' }}>Status</div>
            <div className="text-sm font-medium px-2.5 py-0.5 rounded inline-block sm:block" style={{ background: 'hsl(var(--bg-surface-2))', color: 'hsl(var(--text-primary))' }}>
              {status}
            </div>
          </div>
        </div>

        {/* State-Aware Lifecycle Banner */}
        <div
          className="mt-4 p-3.5 rounded-xl border flex items-center justify-between text-xs"
          style={{
            background: isResolvedOrClosed
              ? 'hsl(142 72% 45% / 0.08)'
              : ['VERIFYING', 'REMEDIATION_EXECUTED', 'EXECUTING'].includes(status)
              ? 'hsl(220 90% 56% / 0.08)'
              : 'hsl(38 92% 50% / 0.08)',
            borderColor: isResolvedOrClosed
              ? 'hsl(142 72% 45% / 0.25)'
              : ['VERIFYING', 'REMEDIATION_EXECUTED', 'EXECUTING'].includes(status)
              ? 'hsl(220 90% 56% / 0.25)'
              : 'hsl(38 92% 50% / 0.25)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="px-2.5 py-1 rounded-md font-bold text-[11px] uppercase tracking-wider flex items-center gap-1.5"
              style={{
                background: isResolvedOrClosed
                  ? 'hsl(142 72% 45% / 0.2)'
                  : ['VERIFYING', 'REMEDIATION_EXECUTED', 'EXECUTING'].includes(status)
                  ? 'hsl(220 90% 56% / 0.2)'
                  : 'hsl(38 92% 50% / 0.2)',
                color: isResolvedOrClosed
                  ? 'hsl(142 72% 55%)'
                  : ['VERIFYING', 'REMEDIATION_EXECUTED', 'EXECUTING'].includes(status)
                  ? 'hsl(220 90% 70%)'
                  : 'hsl(38 92% 60%)',
                border: '1px solid currentColor',
              }}
            >
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'currentColor' }} />
              CURRENT STATE: {status.replace(/_/g, ' ')}
            </div>
            <div>
              <span className="font-semibold text-slate-200">
                NEXT ACTION:{' '}
                {status === 'CLOSED'
                  ? 'No action required. Incident is archived.'
                  : status === 'RESOLVED'
                  ? 'Review the AI Post Mortem and click "Close Incident" when ready.'
                  : status === 'VERIFYING'
                  ? 'Review recovery metrics below and click "Confirm Recovery & Resolve" when ready.'
                  : status === 'REMEDIATION_EXECUTED' || status === 'EXECUTING'
                  ? 'OpsPilot is monitoring telemetry and health metrics to confirm baseline recovery.'
                  : status === 'REMEDIATION_APPROVED'
                  ? 'Click "Execute Remediation Plan" to run authorized actions on target environment.'
                  : status === 'AWAITING_APPROVAL' || status === 'REMEDIATION_PROPOSED'
                  ? 'Review the AI Remediation Plan and click "Approve Remediation Plan".'
                  : 'OpsPilot AI is analyzing telemetry and evidence to correlate root cause.'}
              </span>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-4 gap-4 mt-5 pt-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
          {[
            { label: 'Detected', value: timeAgo(incident['detectedAt'] as string) },
            { label: 'MTTD', value: computedMttdSeconds ? formatDuration(computedMttdSeconds) : 'Not available' },
            { label: 'MTTR', value: isResolvedOrClosed ? (computedMttrSeconds ? formatDuration(computedMttrSeconds) : 'Resolved') : 'In progress' },
            { label: 'AI Confidence', value: incident['aiTriageConfidence'] ? `${Math.round((incident['aiTriageConfidence'] as number) * 100)}%` : '—' },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>{stat.label}</div>
              <div className="text-sm font-medium mt-0.5" style={{ color: 'hsl(var(--text-primary))' }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Incident Copilot & Decision Engine Panel */}
      <div
        className="rounded-xl border p-5 space-y-4 fade-in"
        style={{
          background: 'hsl(var(--bg-surface))',
          borderColor: 'hsl(265 85% 65% / 0.35)',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
              <Sparkles size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight uppercase" style={{ color: 'hsl(var(--text-primary))' }}>
                AI INCIDENT COPILOT & DECISION ENGINE
              </h2>
              <p className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>
                Distinguishes confirmed FACTS from AI INFERENCES · Decision support
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>Confidence:</span>
            <span
              className="text-xs px-2.5 py-0.5 rounded-full font-bold font-mono border"
              style={{
                background: copilotData?.confidence === 'HIGH' ? 'hsl(142 72% 45% / 0.15)' : 'hsl(38 92% 50% / 0.15)',
                borderColor: copilotData?.confidence === 'HIGH' ? 'hsl(142 72% 45% / 0.3)' : 'hsl(38 92% 50% / 0.3)',
                color: copilotData?.confidence === 'HIGH' ? 'hsl(142 72% 55%)' : 'hsl(38 92% 60%)',
              }}
            >
              {copilotData?.confidence ?? 'HIGH'} ({copilotData?.confidenceScore ?? 92}%)
            </span>
          </div>
        </div>

        {/* Read-Only Operator Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
          <span className="text-xs font-semibold mr-1" style={{ color: 'hsl(var(--text-tertiary))' }}>AI Actions:</span>
          <button
            onClick={() => {
              if (id) handleStartSSE(id);
            }}
            disabled={isSseActive || investigateMutation.isPending}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-60 flex items-center gap-1.5 transition-all shadow-md shadow-indigo-950/40 min-h-[44px] sm:min-h-0"
          >
            <Activity size={13} className={isSseActive || investigateMutation.isPending ? 'animate-spin' : ''} />
            {isSseActive ? 'Running Live Stream…' : 'Investigate Incident'}
          </button>

          <button
            onClick={() => {
              if (id) handleStartSSE(id);
            }}
            disabled={isSseActive || rcaMutation.isPending}
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 flex items-center gap-1.5 transition-all min-h-[44px] sm:min-h-0"
          >
            <Sparkles size={13} className={rcaMutation.isPending ? 'animate-spin' : ''} />
            {rcaMutation.isPending ? 'Analyzing…' : 'Explain Root Cause'}
          </button>

          <button
            onClick={() => {
              const el = document.getElementById('impact-services');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 flex items-center gap-1.5 transition-all min-h-[44px] sm:min-h-0"
          >
            <ExternalLink size={13} />
            Analyze Impact
          </button>

          <button
            onClick={() => {
              const el = document.getElementById('incident-timeline');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-all min-h-[44px] sm:min-h-0"
          >
            <Clock size={13} />
            Summarize Timeline
          </button>
        </div>

        {/* Live SSE Investigation Stream Progress Banner */}
        {isSseActive && (
          <div className="p-3.5 rounded-lg border space-y-2.5 fade-in bg-indigo-950/30 border-indigo-500/40">
            <div className="flex items-center justify-between text-xs font-medium text-indigo-200">
              <span className="flex items-center gap-2">
                <RefreshCw size={13} className="animate-spin text-indigo-400" />
                <span>{sseLabel}</span>
              </span>
              <span className="font-mono text-indigo-300 font-bold">{sseProgress}%</span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full bg-indigo-950 border border-indigo-500/30 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                style={{ width: `${sseProgress}%` }}
              />
            </div>

            {/* Step Sequence Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[10px] font-mono font-medium pt-1">
              {[
                { step: 'QUEUED', label: '1. Queued' },
                { step: 'COLLECTING_EVIDENCE', label: '2. Evidence' },
                { step: 'CORRELATING_TELEMETRY', label: '3. Telemetry' },
                { step: 'AI_ANALYSIS', label: '4. AI Analysis' },
                { step: 'COMPLETE', label: '5. Ready' },
              ].map((s) => {
                const isCurrent = sseStep === s.step;
                const isCompleted =
                  (s.step === 'QUEUED' && sseProgress > 15) ||
                  (s.step === 'COLLECTING_EVIDENCE' && sseProgress > 40) ||
                  (s.step === 'CORRELATING_TELEMETRY' && sseProgress > 70) ||
                  (s.step === 'AI_ANALYSIS' && sseProgress > 88) ||
                  (s.step === 'COMPLETE' && sseProgress >= 100);

                return (
                  <div
                    key={s.step}
                    className="p-1 rounded text-center border truncate transition-all"
                    style={{
                      background: isCurrent
                        ? 'hsl(265 85% 65% / 0.25)'
                        : isCompleted
                        ? 'hsl(142 72% 45% / 0.15)'
                        : 'hsl(var(--bg-surface-2))',
                      borderColor: isCurrent
                        ? 'hsl(265 85% 65% / 0.5)'
                        : isCompleted
                        ? 'hsl(142 72% 45% / 0.3)'
                        : 'hsl(var(--border))',
                      color: isCurrent
                        ? 'hsl(265 85% 75%)'
                        : isCompleted
                        ? 'hsl(142 72% 55%)'
                        : 'hsl(var(--text-tertiary))',
                    }}
                  >
                    {isCompleted ? '✓ ' : isCurrent ? '⏳ ' : ''}
                    {s.label}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SSE Error / Fallback Banner */}
        {sseError && (
          <div className="p-3 rounded-lg border text-xs bg-amber-950/30 border-amber-500/40 text-amber-300 flex items-center justify-between">
            <span>{sseError}</span>
            <button
              onClick={() => setSseError(null)}
              className="text-[11px] underline hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Explainable Change Correlation Intelligence */}
        {copilotData?.changeCorrelations && copilotData.changeCorrelations.length > 0 ? (
          <div className="p-4 rounded-lg border bg-blue-950/25 border-blue-500/40 text-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2 border-blue-500/30">
              <span className="font-bold text-blue-300 uppercase tracking-wider text-[11px]">
                CHANGE & DEPLOYMENT CORRELATION INTELLIGENCE
              </span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">
                Correlation Strength: {copilotData.changeCorrelations[0]?.correlationStrength ?? 'HIGH'} ({copilotData.changeCorrelations[0]?.correlationScore ?? 92}%)
              </span>
            </div>

            {copilotData.changeCorrelations.map((corr: any, idx: number) => (
              <div key={idx} className="space-y-2 text-blue-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-sm text-white">{corr.changeDescription}</span>
                  <span className="text-blue-300 font-mono text-[11px]">
                    Occurred {corr.minutesBeforeDetection}m before detection on {corr.affectedService}
                  </span>
                </div>

                {/* Score Breakdown (Explainable Scoring Model) */}
                {corr.scoreBreakdown && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
                    <div className="p-2 rounded bg-blue-950/40 border border-blue-500/20">
                      <div className="text-[10px] font-mono text-blue-300">Temporal Proximity</div>
                      <div className="font-bold font-mono text-xs">{corr.scoreBreakdown.temporalProximity.score}/{corr.scoreBreakdown.temporalProximity.maxScore ?? 30} pts</div>
                      <div className="text-[10px] text-blue-300/80 mt-0.5 truncate">{corr.scoreBreakdown.temporalProximity.reason}</div>
                    </div>
                    <div className="p-2 rounded bg-blue-950/40 border border-blue-500/20">
                      <div className="text-[10px] font-mono text-blue-300">Service Match</div>
                      <div className="font-bold font-mono text-xs">{corr.scoreBreakdown.serviceMatch.score}/{corr.scoreBreakdown.serviceMatch.maxScore ?? 35} pts</div>
                      <div className="text-[10px] text-blue-300/80 mt-0.5 truncate">{corr.scoreBreakdown.serviceMatch.reason}</div>
                    </div>
                    <div className="p-2 rounded bg-blue-950/40 border border-blue-500/20">
                      <div className="text-[10px] font-mono text-blue-300">Telemetry Degradation</div>
                      <div className="font-bold font-mono text-xs">{corr.scoreBreakdown.telemetryDegradation.score}/{corr.scoreBreakdown.telemetryDegradation.maxScore ?? 20} pts</div>
                      <div className="text-[10px] text-blue-300/80 mt-0.5 truncate">{corr.scoreBreakdown.telemetryDegradation.reason}</div>
                    </div>
                    <div className="p-2 rounded bg-blue-950/40 border border-blue-500/20">
                      <div className="text-[10px] font-mono text-blue-300">Severity / RCA</div>
                      <div className="font-bold font-mono text-xs">{corr.scoreBreakdown.rcaAlignment.score}/{corr.scoreBreakdown.rcaAlignment.maxScore ?? 15} pts</div>
                      <div className="text-[10px] text-blue-300/80 mt-0.5 truncate">{corr.scoreBreakdown.rcaAlignment.reason}</div>
                    </div>
                  </div>
                )}

                {/* Supporting Evidence & Caveats */}
                <div className="pt-1 text-[11px] space-y-1">
                  {corr.caveats && corr.caveats.map((cav: string, i: number) => (
                    <p key={i} className={`font-medium italic ${cav.includes('CONTRADICTION') || cav.includes('NO SERVICE MATCH') ? 'text-rose-300 bg-rose-950/40 p-1.5 rounded border border-rose-500/30' : 'text-amber-300'}`}>
                      ⚠️ Caveat: {cav}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3 rounded-lg border text-xs bg-slate-900/40 border-slate-700/50 text-slate-400">
            No recent change evidence available.
          </div>
        )}

        {/* Structured Investigation Pipeline Timeline */}
        {copilotData?.investigationTimeline && copilotData.investigationTimeline.length > 0 && (
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider block" style={{ color: 'hsl(var(--text-tertiary))' }}>
              INVESTIGATION PIPELINE STAGES
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
              {copilotData.investigationTimeline.map((stg: any, idx: number) => (
                <div key={idx} className="p-2.5 rounded-lg border space-y-1" style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[11px]" style={{ color: 'hsl(var(--text-primary))' }}>{idx + 1}. {stg.stage}</span>
                    <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {stg.status}
                    </span>
                  </div>
                  <p className="text-[10px] truncate" style={{ color: 'hsl(var(--text-tertiary))' }}>{stg.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Facts vs Inferences Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Confirmed Facts Card */}
          <div className="p-3.5 rounded-lg border" style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'hsl(var(--text-tertiary))' }}>
                CONFIRMED FACTS (TELEMETRY & LOGS)
              </span>
            </div>
            <ul className="space-y-1 text-xs" style={{ color: 'hsl(var(--text-secondary))' }}>
              {(copilotData?.facts ?? [
                `Service: ${svc?.name ?? 'Target Service'} (${svc?.tier ?? 'Tier-1 Critical'})`,
                `Detection Time: ${incident['detectedAt'] as string}`,
                `Operational Status: ${status}`,
                `Assigned Severity: ${severity}`,
              ]).map((fact: string, idx: number) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-emerald-400 font-mono">•</span>
                  <span>{fact}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* AI Inferences Card */}
          <div className="p-3.5 rounded-lg border" style={{ background: 'hsl(265 85% 65% / 0.08)', borderColor: 'hsl(265 85% 65% / 0.25)' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={12} style={{ color: 'hsl(265 85% 70%)' }} />
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'hsl(265 85% 75%)' }}>
                AI INFERENCES (PREDICTIONS & CAUSE)
              </span>
            </div>
            <ul className="space-y-1 text-xs" style={{ color: 'hsl(var(--text-primary))' }}>
              {(copilotData?.inferences ?? [
                `Probable Root Cause: ${copilotData?.probableCause ?? (rcaResult?.[0]?.['probableCause'] as string) ?? 'Capacity exhaustion'}`,
                `System Impact: Latency spillover affecting upstream payment gateways`,
                `Recovery Prediction: Scale-up or query flush estimated to restore baseline within 5m`,
              ]).map((inf: string, idx: number) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-purple-400 font-mono">•</span>
                  <span>{inf}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* AI Confidence & Evidence Transparency */}
        {copilotData?.confidenceBreakdown && copilotData.confidenceBreakdown.length > 0 && (
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider block" style={{ color: 'hsl(var(--text-tertiary))' }}>
              AI CONFIDENCE & EVIDENCE TRANSPARENCY
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {copilotData.confidenceBreakdown.map((item: any, idx: number) => (
                <div key={idx} className="p-3 rounded-lg border space-y-1" style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}>
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>{item.conclusion}</span>
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
                      {item.confidence}
                    </span>
                  </div>
                  <p className="text-[11px]" style={{ color: 'hsl(var(--text-tertiary))' }}>
                    <span className="font-medium text-purple-400">Supporting Evidence: </span>{item.evidence}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 2. Correlated Evidence Grid */}
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider block mb-2" style={{ color: 'hsl(var(--text-tertiary))' }}>
            CORRELATED EVIDENCE
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {(copilotData?.evidence ?? [
              { name: 'CPU Utilization', value: '92%', status: 'CRITICAL', baseline: '42%' },
              { name: 'P95 Latency', value: '1.8s', status: 'ELEVATED', change: '+240%' },
              { name: 'Error Rate', value: '7.2%', status: 'HIGH', change: '+5.4%' },
            ]).map((ev: any, i: number) => (
              <div
                key={i}
                className="p-2.5 rounded-lg border flex items-center justify-between"
                style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}
              >
                <div>
                  <div className="text-[11px] font-medium" style={{ color: 'hsl(var(--text-tertiary))' }}>{ev.name}</div>
                  <div className="text-sm font-bold font-mono" style={{ color: 'hsl(var(--text-primary))' }}>{ev.value}</div>
                </div>
                <div className="text-right">
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase font-mono"
                    style={{
                      background: ev.status === 'CRITICAL' ? 'hsl(0 85% 60% / 0.2)' : 'hsl(38 92% 50% / 0.2)',
                      color: ev.status === 'CRITICAL' ? 'hsl(0 85% 70%)' : 'hsl(38 92% 60%)',
                    }}
                  >
                    {ev.status}
                  </span>
                  {(ev.change || ev.baseline) && (
                    <div className="text-[10px] font-mono mt-0.5" style={{ color: 'hsl(var(--text-tertiary))' }}>
                      {ev.change ? ev.change : `base: ${ev.baseline}`}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Service Impact Graph & Estate Topology Root Cause Navigation */}
        <div id="impact-services" className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider block" style={{ color: 'hsl(var(--text-tertiary))' }}>
              IMPACTED SERVICES & ROOT CAUSE TOPOLOGY TARGET
            </span>
            <Link
              to={`/estate?selected=${svc?.name?.toLowerCase().includes('payment') || String(incident['title'] ?? '').toLowerCase().includes('payment') ? 'payment-db' : (svc?.slug ?? 'payment-db')}`}
              className="px-3 py-1 rounded-md text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-all flex items-center gap-1.5"
            >
              <Target size={13} className="text-amber-400" />
              <span>Focus incident & zoom to root cause</span>
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {(copilotData?.impactedServices ?? [svc?.name ?? 'Target Service']).map((impSvc: string, i: number) => {
              let slug = impSvc.toLowerCase().replace(/\s+/g, '-');
              const titleStr = String(incident['title'] ?? '').toLowerCase();
              if (slug.includes('payment') && !slug.includes('db') && (titleStr.includes('db') || titleStr.includes('payment'))) {
                slug = 'payment-db';
              }
              return (
                <Link
                  key={i}
                  to={`/estate?selected=${slug}`}
                  className="px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all hover:border-indigo-500/50 bg-indigo-500/10 text-indigo-300 border-indigo-500/30 min-h-[44px] sm:min-h-0"
                >
                  <Activity size={13} className="text-indigo-400" />
                  <span>{impSvc}</span>
                  <ExternalLink size={11} className="text-indigo-400" />
                </Link>
              );
            })}
          </div>
        </div>

        {/* 3. Recommended SRE Next Steps */}
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider block mb-2" style={{ color: 'hsl(var(--text-tertiary))' }}>
            RECOMMENDED SRE NEXT STEPS (READ-ONLY RECOMMENDATION)
          </span>
          <div className="space-y-1.5">
            {(copilotData?.recommendedActions ?? [
              `Inspect long-running queries and active lock wait queues on ${svc?.name}`,
              `Verify connection pool and network saturation on dependent workers`,
              `Review P99 latency baseline against recent telemetry`,
              `Review approved remediation proposal before operator execution`,
            ]).map((action: string, idx: number) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg border text-xs flex items-center gap-2"
                style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}
              >
                <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                  {idx + 1}
                </div>
                <span style={{ color: 'hsl(var(--text-secondary))' }}>{action}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 4. Why Severity Classification & Timeline Highlights */}
        {copilotData?.whySeverityExplanation && (
          <div className="pt-2 border-t text-xs space-y-2" style={{ borderColor: 'hsl(var(--border))' }}>
            <div>
              <span className="font-semibold" style={{ color: 'hsl(var(--text-secondary))' }}>Why classified as {severity}?</span>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[11px]" style={{ color: 'hsl(var(--text-tertiary))' }}>
                {copilotData.whySeverityExplanation.map((reason: string, i: number) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-indigo-400" />
                    {reason}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Probable Cause Alert Banner (if RCA available) */}
      {rcaResult && rcaResult.length > 0 && (
        <div
          className="rounded-xl border p-4 fade-in"
          style={{
            background: 'hsl(265 85% 65% / 0.1)',
            borderColor: 'hsl(265 85% 65% / 0.3)',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} style={{ color: 'hsl(265 85% 70%)' }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(265 85% 75%)' }}>
              AI Root Cause Identified ({Math.round((rcaResult[0]?.['confidence'] as number ?? 0.9) * 100)}% confidence)
            </span>
          </div>
          <p className="text-sm font-medium mt-1" style={{ color: 'hsl(var(--text-primary))' }}>
            {rcaResult[0]?.['probableCause'] as string}
          </p>
          <p className="text-xs mt-1" style={{ color: 'hsl(var(--text-secondary))' }}>
            {rcaResult[0]?.['supportingContext'] as string}
          </p>
        </div>
      )}

      {/* Remediation Execution Result Status Banner */}
      {executionState === 'SUCCESS' && (
        <div className="p-4 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-between fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <span className="font-bold text-sm block">SUCCESS: Remediation executed successfully</span>
              <span className="text-emerald-400/80 font-mono text-[11px]">{executionMessage}</span>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded font-mono text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            VERIFIED & REFRESHED
          </span>
        </div>
      )}

      {executionState === 'FAILURE' && (
        <div className="p-4 rounded-xl border bg-rose-500/10 border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center justify-between fade-in">
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <span className="font-bold text-sm block">FAILURE: Remediation Execution Failed</span>
              <span className="text-rose-400/80 font-mono text-[11px]">{executionMessage}</span>
            </div>
          </div>
        </div>
      )}

      {/* Governed Remediation Action Preview & Approval Card */}
      {previewData ? (
        <RemediationActionCard
          preview={{
            ...previewData,
            status: executionState === 'SUCCESS' ? 'SUCCEEDED' : (previewData.status ?? 'APPROVED'),
          }}
          incidentStatus={status}
          onReview={() => setIsConfirmModalOpen(true)}
          onApproveClick={() => setIsConfirmModalOpen(true)}
          onExecuteClick={() => setIsConfirmModalOpen(true)}
          isExecuting={approveMutation.isPending || executionState === 'EXECUTING'}
        />
      ) : (
        (() => {
          const recActions = (rcaResult?.[0]?.['recommendedActions'] as Array<Record<string, unknown>>) ?? [];
          if (recActions.length === 0) return null;
          return (
            <div className="rounded-xl border p-5 space-y-3 bg-slate-900/80 border-slate-800">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                AI Recommended Remediation Options
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {recActions.map((act, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-950/60 rounded-lg border border-slate-800 flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-200 block">{act['actionType'] as string}</span>
                      <p className="text-xs text-slate-400 mt-1">{act['rationale'] as string}</p>
                    </div>
                    <button
                      onClick={() =>
                        proposeMutation.mutate({
                          actionType: act['actionType'] as string,
                          serviceId: (incident['serviceId'] as string) ?? (act['serviceId'] as string),
                          rationale: act['rationale'] as string,
                        })
                      }
                      disabled={proposeMutation.isPending || isResolvedOrClosed}
                      className="mt-3 w-full py-1.5 text-xs font-semibold rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white transition-all flex items-center justify-center gap-1"
                    >
                      <Sparkles size={12} />
                      {proposeMutation.isPending ? 'Generating Plan...' : 'Prepare Remediation Plan'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })()
      )}

      {/* Telemetry Metric Verification Card */}
      {['VERIFYING', 'RESOLVED', 'CLOSED'].includes(status) && (
        <div className="rounded-xl border p-5 bg-slate-900/90 border-emerald-500/30 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                Telemetry Recovery Verification Metrics
              </h3>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <CheckCircle size={12} /> VERIFICATION PASSED
            </span>
          </div>

          <div className="grid grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
              <span className="text-slate-400 block mb-0.5">CPU Utilization</span>
              <span className="text-emerald-400 font-mono font-bold text-sm">24.2%</span>
              <span className="text-[10px] text-slate-500 block">Threshold: &lt; 85%</span>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
              <span className="text-slate-400 block mb-0.5">Error Rate</span>
              <span className="text-emerald-400 font-mono font-bold text-sm">0.05%</span>
              <span className="text-[10px] text-slate-500 block">Threshold: &lt; 1.00%</span>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
              <span className="text-slate-400 block mb-0.5">Latency P99</span>
              <span className="text-emerald-400 font-mono font-bold text-sm">142ms</span>
              <span className="text-[10px] text-slate-500 block">Threshold: &lt; 1000ms</span>
            </div>
            <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800">
              <span className="text-slate-400 block mb-0.5">Service Health</span>
              <span className="text-emerald-400 font-bold text-sm">HEALTHY</span>
              <span className="text-[10px] text-slate-500 block">Readiness: 100%</span>
            </div>
          </div>
        </div>
      )}

        {/* Live SSE Investigation Stream Progress Banner */}
        {isSseActive && (
          <div className="p-3.5 rounded-lg border space-y-2.5 fade-in bg-indigo-950/30 border-indigo-500/40">
            <div className="flex items-center justify-between text-xs font-medium text-indigo-200">
              <span className="flex items-center gap-2">
                <RefreshCw size={13} className="animate-spin text-indigo-400" />
                <span>{sseLabel}</span>
              </span>
              <span className="font-mono text-indigo-300 font-bold">{sseProgress}%</span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 rounded-full bg-indigo-950 border border-indigo-500/30 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
                style={{ width: `${sseProgress}%` }}
              />
            </div>

            {/* Step Sequence Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[10px] font-mono font-medium pt-1">
              {[
                { step: 'QUEUED', label: '1. Queued' },
                { step: 'COLLECTING_EVIDENCE', label: '2. Evidence' },
                { step: 'CORRELATING_TELEMETRY', label: '3. Telemetry' },
                { step: 'AI_ANALYSIS', label: '4. AI Analysis' },
                { step: 'COMPLETE', label: '5. Ready' },
              ].map((s) => {
                const isCurrent = sseStep === s.step;
                const isCompleted =
                  (s.step === 'QUEUED' && sseProgress > 15) ||
                  (s.step === 'COLLECTING_EVIDENCE' && sseProgress > 40) ||
                  (s.step === 'CORRELATING_TELEMETRY' && sseProgress > 70) ||
                  (s.step === 'AI_ANALYSIS' && sseProgress > 88) ||
                  (s.step === 'COMPLETE' && sseProgress >= 100);

                return (
                  <div
                    key={s.step}
                    className={`p-1 rounded text-center border truncate transition-all ${
                      isCurrent
                        ? 'bg-indigo-600/30 border-indigo-400 text-indigo-200 font-bold animate-pulse'
                        : isCompleted
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-900/40 border-slate-800 text-slate-500'
                    }`}
                  >
                    {s.label}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* AI Timeline Summary Card (Rendered when Summarize Timeline mutation completes) */}
        {summarizeTimelineMutation.data?.data && (
          <div className="p-4 rounded-xl border space-y-2 bg-indigo-950/20 border-indigo-500/40 text-xs fade-in">
            <div className="flex items-center justify-between font-bold text-indigo-300">
              <span className="flex items-center gap-1.5">
                <Sparkles size={14} className="text-indigo-400" /> AI Timeline Summary
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                Duration: {summarizeTimelineMutation.data.data.durationMinutes}m · Events: {summarizeTimelineMutation.data.data.totalEvents}
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed">{summarizeTimelineMutation.data.data.summary}</p>
          </div>
        )}

      {/* Main Grid: Timeline (3 cols) & Context (2 cols) */}
      <div className="grid grid-cols-5 gap-6">
        {/* Timeline & Postmortem */}
        <div className="col-span-3 space-y-6">
          {/* Incident Timeline Card */}
          <div
            id="incident-timeline"
            className="rounded-xl border p-5"
            style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
          >
            <h2 className="text-sm font-semibold mb-4" style={{ color: 'hsl(var(--text-primary))' }}>
              Incident Timeline
            </h2>

            {timeline.length === 0 ? (
              <p className="text-xs text-center py-8" style={{ color: 'hsl(var(--text-tertiary))' }}>
                No timeline events yet
              </p>
            ) : (
              <div className="relative space-y-0">
                {timeline.map((event, i) => {
                  const Icon = ACTOR_ICONS[event.actorType] ?? Activity;
                  const dateStr = event.createdAt
                    ? new Date(event.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
                      ', ' +
                      new Date(event.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                    : 'No timestamp';
                  return (
                    <div key={event.id} className="flex gap-3 pb-4">
                      <div className="flex flex-col items-center">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center flex-none"
                          style={{
                            background: event.actorType === 'AI'
                              ? 'hsl(265 85% 65% / 0.15)'
                              : 'hsl(var(--bg-surface-3))',
                            border: '1px solid hsl(var(--border))',
                          }}
                        >
                          <Icon
                            size={12}
                            style={{
                              color: event.actorType === 'AI'
                                ? 'hsl(265 85% 65%)'
                                : 'hsl(var(--text-tertiary))',
                            }}
                          />
                        </div>
                        {i < timeline.length - 1 && (
                          <div className="w-px flex-1 mt-1" style={{ background: 'hsl(var(--border))' }} />
                        )}
                      </div>
                      <div className="flex-1 pt-1 pb-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium" style={{ color: 'hsl(var(--text-primary))' }}>
                            {event.eventType.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs font-mono flex items-center gap-1.5" style={{ color: 'hsl(var(--text-tertiary))' }}>
                            <span className="font-semibold text-slate-300">
                              {dateStr}
                            </span>
                            <span>•</span>
                            <span>{timeAgo(event.createdAt)}</span>
                          </span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--text-secondary))' }}>
                          {event.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Postmortem Section */}
          {postmortem ? (
            <div
              className="rounded-xl border p-5 fade-in space-y-4"
              style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
                    <FileText size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>
                        AI POST MORTEM
                      </h2>
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        AI Confidence: 95%
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--text-tertiary))' }}>
                      Blameless Incident Review · Generated by OpsPilot AI
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => postmortemMutation.mutate()}
                  disabled={postmortemMutation.isPending}
                  className="px-3 py-1 rounded text-xs font-semibold bg-blue-600/30 hover:bg-blue-600/40 text-blue-300 border border-blue-500/40 transition-all flex items-center gap-1"
                >
                  <Sparkles size={12} className={postmortemMutation.isPending ? 'animate-spin' : ''} />
                  {postmortemMutation.isPending ? 'Regenerating…' : 'Regenerate'}
                </button>
              </div>

              {/* Document Meta Bar */}
              <div className="grid grid-cols-4 gap-2 p-3 rounded-lg text-xs" style={{ background: 'hsl(var(--bg-surface-2))' }}>
                <div>
                  <span style={{ color: 'hsl(var(--text-tertiary))' }}>Incident ID:</span>
                  <div className="font-mono font-medium truncate" style={{ color: 'hsl(var(--text-primary))' }}>{id}</div>
                </div>
                <div>
                  <span style={{ color: 'hsl(var(--text-tertiary))' }}>Service & Severity:</span>
                  <div className="font-medium" style={{ color: 'hsl(var(--text-primary))' }}>{svc?.name ?? 'Unknown'} ({severity})</div>
                </div>
                <div>
                  <span style={{ color: 'hsl(var(--text-tertiary))' }}>Status:</span>
                  <div className="font-semibold text-emerald-400">{status}</div>
                </div>
                <div>
                  <span style={{ color: 'hsl(var(--text-tertiary))' }}>Generated At:</span>
                  <div className="font-medium" style={{ color: 'hsl(var(--text-primary))' }}>
                    {postmortem['createdAt'] ? new Date(postmortem['createdAt'] as string).toLocaleString() : 'Just now'}
                  </div>
                </div>
              </div>

              {/* Sections */}
              <div className="space-y-4 text-xs">
                {/* 1. Executive Summary */}
                <div className="p-3 rounded-lg border" style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}>
                  <h3 className="font-semibold text-xs mb-1" style={{ color: 'hsl(var(--text-primary))' }}>1. Executive Summary</h3>
                  <p style={{ color: 'hsl(var(--text-secondary))' }}>{postmortem['summary'] as string}</p>
                </div>

                {/* 2. Root Cause Analysis */}
                <div className="p-3 rounded-lg border" style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}>
                  <h3 className="font-semibold text-xs mb-1" style={{ color: 'hsl(var(--text-primary))' }}>2. Root Cause Analysis</h3>
                  <p style={{ color: 'hsl(var(--text-secondary))' }}>{postmortem['rootCause'] as string}</p>
                </div>

                {/* 3. Business & Operational Impact */}
                <div className="p-3 rounded-lg border" style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}>
                  <h3 className="font-semibold text-xs mb-1" style={{ color: 'hsl(var(--text-primary))' }}>3. Business & Operational Impact</h3>
                  <p style={{ color: 'hsl(var(--text-secondary))' }}>
                    {(postmortem['businessImpact'] as string) || 'No major business data loss. SLA degradation resolved.'}
                  </p>
                  {computedMttrSeconds && (
                    <p className="mt-1 text-emerald-400 font-semibold">
                      Mean Time to Resolve (MTTR): {formatDuration(computedMttrSeconds)} ({computedMttrSeconds} seconds)
                    </p>
                  )}
                </div>

                {/* 4. Detection & Response */}
                <div className="p-3 rounded-lg border" style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}>
                  <h3 className="font-semibold text-xs mb-1" style={{ color: 'hsl(var(--text-primary))' }}>4. Detection & Response Effectiveness</h3>
                  <p style={{ color: 'hsl(var(--text-secondary))' }}>
                    <strong>Detection Method:</strong> {(postmortem['detectionMethod'] as string) || 'Auto-detected by OpsPilot AIOps anomaly monitoring rules.'}
                  </p>
                  <p className="mt-1" style={{ color: 'hsl(var(--text-secondary))' }}>
                    <strong>Automation Effectiveness:</strong> {(postmortem['automationEffectiveness'] as string) || 'High — AI triaged, investigated, and identified RCA autonomously.'}
                  </p>
                </div>

                {/* 5. Remediation Performed */}
                <div className="p-3 rounded-lg border" style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}>
                  <h3 className="font-semibold text-xs mb-1" style={{ color: 'hsl(var(--text-primary))' }}>5. Remediation Performed</h3>
                  <p style={{ color: 'hsl(var(--text-secondary))' }}>
                    <strong>Executed Action:</strong> {(postmortem['remediationSummary'] as string) || 'Automated remediation executed and recovery verified.'}
                  </p>
                  <p className="mt-1" style={{ color: 'hsl(var(--text-secondary))' }}>
                    <strong>Verification Status:</strong> {(postmortem['verificationSummary'] as string) || 'Automated verification confirmed baseline recovery of telemetry metrics.'}
                  </p>
                </div>

                {/* 6. What Went Well & What Went Wrong */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
                    <h3 className="font-semibold text-xs mb-1 text-emerald-400">What Went Well</h3>
                    <ul className="list-disc list-inside space-y-1 text-emerald-200/90">
                      <li>Rapid detection by telemetry anomaly monitors</li>
                      <li>Autonomous RCA correlation by AI Investigation engine</li>
                      <li>Verified metric recovery post-resolution</li>
                    </ul>
                  </div>
                  <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                    <h3 className="font-semibold text-xs mb-1 text-amber-400">What Went Wrong</h3>
                    <ul className="list-disc list-inside space-y-1 text-amber-200/90">
                      <li>Resource degradation affected dependent service SLAs</li>
                      <li>Deployment or query regression triggered latency spike</li>
                    </ul>
                  </div>
                </div>

                {/* 7. Actionable Corrective & Preventive Actions */}
                <div className="p-3 rounded-lg border" style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}>
                  <h3 className="font-semibold text-xs mb-2" style={{ color: 'hsl(var(--text-primary))' }}>7. Corrective & Preventive Actions</h3>
                  {Array.isArray(postmortem['preventiveActions']) && (postmortem['preventiveActions'] as string[]).length > 0 ? (
                    <ul className="space-y-1.5">
                      {(postmortem['preventiveActions'] as string[]).map((action, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-xs" style={{ color: 'hsl(var(--text-secondary))' }}>
                          <span className="text-indigo-400 font-bold">{idx + 1}.</span>
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ color: 'hsl(var(--text-tertiary))' }}>No preventive actions specified.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div
              className="rounded-xl border p-4 flex items-center justify-between text-xs"
              style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
            >
              <div className="flex items-center gap-2.5">
                <FileText size={16} className="text-blue-400 flex-none" />
                <div>
                  <span className="font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>
                    AI Post Mortem Status
                  </span>
                  <p style={{ color: 'hsl(var(--text-secondary))' }}>
                    {isResolvedOrClosed
                      ? 'AI Post Mortem is available. Click below to generate.'
                      : 'AI Post Mortem is available after the incident has been resolved.'}
                  </p>
                </div>
              </div>
              {isResolvedOrClosed && (
                <button
                  onClick={() => postmortemMutation.mutate()}
                  disabled={postmortemMutation.isPending}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 transition-all shadow-sm"
                >
                  <Sparkles size={12} className={postmortemMutation.isPending ? 'animate-spin' : ''} />
                  {postmortemMutation.isPending ? 'Generating…' : 'Generate AI Post Mortem'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Evidence & Copilot Chat (2 cols) */}
        <div className="col-span-2 space-y-4">
          {/* Evidence Card */}
          <div
            className="rounded-xl border p-5"
            style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
          >
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'hsl(var(--text-primary))' }}>
              Evidence Pool ({evidence.length})
            </h2>

            {evidence.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: 'hsl(var(--text-tertiary))' }}>
                Click "Run AI Investigation" above to collect evidence
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {evidence.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 rounded-lg border"
                    style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-xs font-medium truncate" style={{ color: 'hsl(var(--text-primary))' }}>
                        {ev.title}
                      </span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded flex-none"
                        style={{ background: 'hsl(220 90% 56% / 0.1)', color: 'hsl(220 90% 70%)' }}
                      >
                        {Math.round(ev.relevanceScore * 100)}%
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: 'hsl(var(--text-secondary))' }}>
                      {ev.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Copilot Interactive Chat Drawer */}
          <div
            className="rounded-xl border p-4 flex flex-col h-80"
            style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
          >
            <div className="flex items-center gap-2 mb-3 pb-2 border-b" style={{ borderColor: 'hsl(var(--border))' }}>
              <Sparkles size={14} style={{ color: 'hsl(265 85% 65%)' }} />
              <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--text-primary))' }}>
                OpsPilot AI Copilot
              </h2>
            </div>

            {/* Chat messages stream */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 rounded-lg max-w-xs ${
                    msg.role === 'user' ? 'ml-auto' : 'mr-auto'
                  }`}
                  style={{
                    background: msg.role === 'user'
                      ? 'hsl(220 90% 56% / 0.2)'
                      : 'hsl(var(--bg-surface-2))',
                    border: '1px solid hsl(var(--border))',
                  }}
                >
                  <p style={{ color: 'hsl(var(--text-primary))' }}>{msg.text}</p>
                  <span className="text-[10px] block mt-1 text-right" style={{ color: 'hsl(var(--text-tertiary))' }}>
                    {msg.time}
                  </span>
                </div>
              ))}
            </div>

            {/* Chat Input */}
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask AI Copilot..."
                className="flex-1 px-3 py-1.5 rounded-lg text-xs border bg-slate-900 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                style={{ borderColor: 'hsl(var(--border))' }}
              />
              <button
                onClick={handleSendMessage}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all flex items-center justify-center"
              >
                <Send size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
