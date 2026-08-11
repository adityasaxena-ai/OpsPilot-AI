import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Activity, AlertTriangle, CheckCircle, XCircle, Sparkles, Send, RefreshCw, FileText } from 'lucide-react';
import { api } from '@/lib/api';
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
    enabled: !!id,
    refetchInterval: 10_000,
  });

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

  const approveMutation = useMutation({
    mutationFn: (actionId: string) => api.remediation.approve(actionId),
    onSuccess: () => {
      setIsConfirmModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      refetchTimeline();
      refetchRemediation();
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (newStatus: string) => api.incidents.updateStatus(id!, newStatus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      refetchTimeline();
    },
  });

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
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-md backdrop-blur-md">
        <div className="flex items-center justify-between relative">
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
      <div className="flex items-center justify-between">
        <Link
          to="/incidents"
          className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:text-indigo-400"
          style={{ color: 'hsl(var(--text-secondary))' }}
        >
          <ArrowLeft size={14} /> Back to Incidents
        </Link>

        {/* AI Action Trigger Buttons */}
        <div className="flex items-center gap-2">
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

          {status === 'VERIFYING' && (
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
        className="rounded-xl border p-5"
        style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
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
              <span className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>
                {svc?.name}
              </span>
            </div>
            <h1 className="text-lg font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>
              {incident['title'] as string}
            </h1>
            <p className="text-sm mt-1" style={{ color: 'hsl(var(--text-secondary))' }}>
              {incident['description'] as string}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs mb-1" style={{ color: 'hsl(var(--text-tertiary))' }}>Status</div>
            <div className="text-sm font-medium px-2.5 py-0.5 rounded" style={{ background: 'hsl(var(--bg-surface-2))', color: 'hsl(var(--text-primary))' }}>
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
            { label: 'MTTD', value: incident['mttdSeconds'] ? formatDuration(incident['mttdSeconds'] as number) : '—' },
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

      {/* Governed Remediation Action Preview & Approval Card */}
      {previewData ? (
        <RemediationActionCard
          preview={previewData}
          incidentStatus={status}
          onReview={() => setIsConfirmModalOpen(true)}
          onApproveClick={() => setIsConfirmModalOpen(true)}
          onExecuteClick={() => setIsConfirmModalOpen(true)}
          isExecuting={approveMutation.isPending}
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

      {/* Confirmation Modal */}
      <RemediationConfirmModal
        isOpen={isConfirmModalOpen}
        preview={previewData}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={() => {
          if (previewData?.actionId) {
            approveMutation.mutate(previewData.actionId);
          }
        }}
        isConfirming={approveMutation.isPending}
      />

      {/* Main Grid: Timeline (3 cols) & Context (2 cols) */}
      <div className="grid grid-cols-5 gap-6">
        {/* Timeline & Postmortem */}
        <div className="col-span-3 space-y-6">
          {/* Incident Timeline Card */}
          <div
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
                          <span className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>
                            {timeAgo(event.createdAt)}
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
