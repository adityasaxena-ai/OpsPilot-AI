import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Activity, AlertTriangle, CheckCircle, XCircle, Sparkles, Send, RefreshCw, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { severityColor, timeAgo, formatDuration } from '@/lib/utils';

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      refetchTimeline();
      refetchRemediation();
    },
  });

  const approveMutation = useMutation({
    mutationFn: (actionId: string) => api.remediation.approve(actionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      refetchTimeline();
      refetchRemediation();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (actionId: string) => api.remediation.reject(actionId, 'Rejected by operator in Control Tower'),
    onSuccess: () => {
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

  const { data: topologyData } = useQuery({
    queryKey: ['incident', id, 'topology'],
    queryFn: () => api.incidents.topology(id!),
    enabled: !!id,
  });

  const investigateMutation = useMutation({
    mutationFn: () => api.ai.investigate(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      refetchTimeline();
      refetchEvidence();
    },
  });

  const postmortemMutation = useMutation({
    mutationFn: () => api.ai.postmortem(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
    },
  });

  const chatMutation = useMutation({
    mutationFn: (msg: string) => api.ai.chat(msg, id),
    onSuccess: (res) => {
      setChatMessages((prev) => [
        ...prev,
        { role: 'ai', text: res.data.reply, time: 'Just now' },
      ]);
    },
  });

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatMutation.isPending) return;

    const userText = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', text: userText, time: 'Just now' }]);
    chatMutation.mutate(userText);
  };

  const incident = incData?.data as Record<string, unknown> | undefined;
  const timeline = (timelineData?.data as IncidentEvent[] | undefined) ?? [];
  const evidence = (evidenceData?.data as EvidenceItem[] | undefined) ?? [];
  const topology = (topologyData?.data as Record<string, unknown> | undefined);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-48 w-full" />
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="text-center py-16">
        <p style={{ color: 'hsl(var(--text-tertiary))' }}>Incident not found</p>
        <Link to="/incidents" className="text-sm mt-2 block" style={{ color: 'hsl(220 90% 65%)' }}>
          ← Back to Incidents
        </Link>
      </div>
    );
  }

  const svc = incident['service'] as { name: string } | undefined;
  const severity = incident['severity'] as string;
  const status = incident['status'] as string;
  const mttr = incident['mttrSeconds'] as number | null;
  const rcaResult = incident['rcaResults'] as Array<Record<string, unknown>> | undefined;
  const postmortem = incident['postmortem'] as Record<string, unknown> | undefined;

  return (
    <div className="space-y-5 fade-in">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link
          to="/incidents"
          className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
          style={{ color: 'hsl(var(--text-tertiary))' }}
        >
          <ArrowLeft size={14} /> Back to Incidents
        </Link>

        {/* AI Action Triggers */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => investigateMutation.mutate()}
            disabled={investigateMutation.isPending}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all hover:opacity-80"
            style={{
              background: 'hsl(265 85% 65% / 0.15)',
              borderColor: 'hsl(265 85% 65% / 0.4)',
              color: 'hsl(265 85% 75%)',
            }}
          >
            {investigateMutation.isPending ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} />
            )}
            Run AI Investigation
          </button>

          <button
            onClick={() => postmortemMutation.mutate()}
            disabled={postmortemMutation.isPending}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all hover:opacity-80"
            style={{
              background: 'hsl(var(--bg-surface-2))',
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--text-secondary))',
            }}
          >
            {postmortemMutation.isPending ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <FileText size={13} />
            )}
            Generate AI Postmortem
          </button>
        </div>
      </div>

      {/* Incident Header Card */}
      <div
        className="rounded-xl border p-5"
        style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
      >
        {/* State Machine Transition Bar */}
        <div className="mb-4 pb-4 border-b flex items-center justify-between" style={{ borderColor: 'hsl(var(--border))' }}>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Lifecycle State:</span>
            <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
              {status}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {['DETECTED'].includes(status) && (
              <button
                onClick={() => updateStatusMutation.mutate('ACKNOWLEDGED')}
                className="px-3 py-1 rounded text-xs font-semibold bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/40 transition-all"
              >
                Acknowledge
              </button>
            )}

            {['DETECTED', 'ACKNOWLEDGED'].includes(status) && (
              <button
                onClick={() => updateStatusMutation.mutate('INVESTIGATING')}
                className="px-3 py-1 rounded text-xs font-semibold bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-600/40 transition-all"
              >
                Investigate
              </button>
            )}

            {['INVESTIGATING'].includes(status) && (
              <button
                onClick={() => updateStatusMutation.mutate('MITIGATED')}
                className="px-3 py-1 rounded text-xs font-semibold bg-amber-600/30 text-amber-300 border border-amber-500/40 hover:bg-amber-600/40 transition-all"
              >
                Mitigate
              </button>
            )}

            {['DETECTED', 'ACKNOWLEDGED', 'INVESTIGATING', 'MITIGATED'].includes(status) && (
              <button
                onClick={() => updateStatusMutation.mutate('RESOLVED')}
                className="px-3 py-1 rounded text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-sm"
              >
                Resolve Incident
              </button>
            )}

            {['RESOLVED'].includes(status) && (
              <button
                onClick={() => updateStatusMutation.mutate('CLOSED')}
                className="px-3 py-1 rounded text-xs font-semibold bg-slate-700 text-slate-200 hover:bg-slate-600 transition-all"
              >
                Close Incident
              </button>
            )}
          </div>
        </div>

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
            <div className="text-sm font-medium px-2 py-0.5 rounded" style={{ background: 'hsl(var(--bg-surface-2))', color: 'hsl(var(--text-primary))' }}>
              {status}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-4 gap-4 mt-5 pt-4 border-t" style={{ borderColor: 'hsl(var(--border))' }}>
          {[
            { label: 'Detected', value: timeAgo(incident['detectedAt'] as string) },
            { label: 'MTTD', value: incident['mttdSeconds'] ? formatDuration(incident['mttdSeconds'] as number) : '—' },
            { label: 'MTTR', value: mttr ? formatDuration(mttr) : 'In progress' },
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

      {/* Governed Remediation & Human Approval Workflow Card */}
      {(() => {
        const actions = (remediationData?.data as Array<Record<string, unknown>> | undefined) ?? [];
        const incidentActions = actions.filter((a) => a['incidentId'] === id);
        const pendingAction = incidentActions.find((a) => a['status'] === 'AWAITING_APPROVAL' || a['status'] === 'PROPOSED');
        const executedActions = incidentActions.filter((a) => a['status'] === 'SUCCEEDED' || a['status'] === 'EXECUTING');

        const recActions = (rcaResult?.[0]?.['recommendedActions'] as Array<Record<string, unknown>>) ?? [];

        return (
          <div
            className="rounded-xl border p-5 space-y-4 fade-in"
            style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>
                  Governed Autonomous Remediation
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'hsl(var(--text-tertiary))' }}>
                  Policy Engine & Risk Engine Guardrails
                </p>
              </div>

              {pendingAction && (
                <span
                  className="text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{ background: 'hsl(38 92% 50% / 0.15)', color: 'hsl(38 92% 60%)' }}
                >
                  Approval Pending (15m Expiry)
                </span>
              )}
            </div>

            {/* Pending Approval Details */}
            {pendingAction ? (
              <div
                className="p-4 rounded-xl border space-y-3"
                style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(38 92% 50% / 0.3)' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold" style={{ color: 'hsl(var(--text-primary))' }}>
                      {pendingAction['actionType'] as string}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded font-mono font-medium"
                      style={{
                        background: (pendingAction['riskScore'] as number) > 60
                          ? 'hsl(0 85% 60% / 0.15)'
                          : 'hsl(142 72% 45% / 0.15)',
                        color: (pendingAction['riskScore'] as number) > 60
                          ? 'hsl(0 85% 65%)'
                          : 'hsl(142 72% 55%)',
                      }}
                    >
                      Risk: {pendingAction['riskScore'] as number}/100 ({pendingAction['riskLevel'] as string})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => approveMutation.mutate(pendingAction['id'] as string)}
                      disabled={approveMutation.isPending}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 flex items-center gap-1.5"
                      style={{ background: 'hsl(142 72% 45%)', color: 'white' }}
                    >
                      {approveMutation.isPending ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                      Approve & Execute
                    </button>

                    <button
                      onClick={() => rejectMutation.mutate(pendingAction['id'] as string)}
                      disabled={rejectMutation.isPending}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all hover:opacity-80 flex items-center gap-1.5"
                      style={{ background: 'hsl(0 85% 55% / 0.1)', borderColor: 'hsl(0 85% 55% / 0.3)', color: 'hsl(0 85% 65%)' }}
                    >
                      {rejectMutation.isPending ? <RefreshCw size={12} className="animate-spin" /> : <XCircle size={12} />}
                      Reject Action
                    </button>
                  </div>
                </div>

                <p className="text-xs" style={{ color: 'hsl(var(--text-secondary))' }}>
                  Action requires human confirmation per Policy Engine risk ceiling rules.
                </p>
              </div>
            ) : recActions.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {recActions.map((act, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border flex flex-col justify-between"
                    style={{ background: 'hsl(var(--bg-surface-2))', borderColor: 'hsl(var(--border))' }}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold" style={{ color: 'hsl(var(--text-primary))' }}>
                          {act['actionType'] as string}
                        </span>
                        <span className="text-xs text-tertiary">
                          Est Risk: {act['estimatedRisk'] as string}
                        </span>
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'hsl(var(--text-secondary))' }}>
                        {act['rationale'] as string}
                      </p>
                    </div>

                    <button
                      onClick={() => proposeMutation.mutate({
                        actionType: act['actionType'] as string,
                        serviceId: (act['serviceId'] as string) ?? incident['serviceId'] as string,
                        rationale: act['rationale'] as string,
                      })}
                      disabled={proposeMutation.isPending}
                      className="mt-3 w-full py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
                      style={{ background: 'hsl(220 90% 56%)', color: 'white' }}
                    >
                      {proposeMutation.isPending ? 'Evaluating Risk...' : 'Propose Action for Governance'}
                    </button>
                  </div>
                ))}
              </div>
            ) : executedActions.length > 0 ? (
              <div className="p-3 rounded-lg border text-xs" style={{ background: 'hsl(142 72% 45% / 0.1)', borderColor: 'hsl(142 72% 45% / 0.3)', color: 'hsl(142 72% 55%)' }}>
                ✅ Remediation executed successfully on service. Telemetry baseline verified.
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'hsl(var(--text-tertiary))' }}>
                Run AI Investigation above to generate recommended remediation actions.
              </p>
            )}
          </div>
        );
      })()}

      {/* Main Grid */}
      <div className="grid grid-cols-5 gap-4">
        {/* Timeline & Evidence (3 cols) */}
        <div className="col-span-3 space-y-4">
          {/* Timeline */}
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

          {/* Postmortem Section (if generated) */}
          {postmortem && (
            <div
              className="rounded-xl border p-5 fade-in"
              style={{ background: 'hsl(var(--bg-surface))', borderColor: 'hsl(var(--border))' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <FileText size={16} style={{ color: 'hsl(220 90% 65%)' }} />
                <h2 className="text-sm font-semibold" style={{ color: 'hsl(var(--text-primary))' }}>
                  AI Auto-Generated Postmortem
                </h2>
              </div>
              <div className="space-y-3 text-xs">
                <div>
                  <span className="font-semibold" style={{ color: 'hsl(var(--text-tertiary))' }}>Summary:</span>
                  <p className="mt-0.5" style={{ color: 'hsl(var(--text-secondary))' }}>{postmortem['summary'] as string}</p>
                </div>
                <div>
                  <span className="font-semibold" style={{ color: 'hsl(var(--text-tertiary))' }}>Business Impact:</span>
                  <p className="mt-0.5" style={{ color: 'hsl(var(--text-secondary))' }}>{postmortem['businessImpact'] as string}</p>
                </div>
                <div>
                  <span className="font-semibold" style={{ color: 'hsl(var(--text-tertiary))' }}>Root Cause:</span>
                  <p className="mt-0.5" style={{ color: 'hsl(var(--text-secondary))' }}>{postmortem['rootCause'] as string}</p>
                </div>
              </div>
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
                    color: 'hsl(var(--text-primary))',
                  }}
                >
                  <p>{msg.text}</p>
                </div>
              ))}
              {chatMutation.isPending && (
                <div className="text-xs p-2 rounded-lg" style={{ background: 'hsl(var(--bg-surface-2))', color: 'hsl(var(--text-tertiary))' }}>
                  AI Copilot is thinking...
                </div>
              )}
            </div>

            {/* Chat Form */}
            <form onSubmit={handleSendChat} className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask AI Copilot about this incident..."
                className="flex-1 text-xs px-3 py-2 rounded-lg border outline-none"
                style={{
                  background: 'hsl(var(--bg-surface-2))',
                  borderColor: 'hsl(var(--border))',
                  color: 'hsl(var(--text-primary))',
                }}
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || chatMutation.isPending}
                className="p-2 rounded-lg transition-all"
                style={{
                  background: chatInput.trim() ? 'hsl(220 90% 56%)' : 'hsl(var(--bg-surface-3))',
                  color: 'white',
                }}
              >
                <Send size={12} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
