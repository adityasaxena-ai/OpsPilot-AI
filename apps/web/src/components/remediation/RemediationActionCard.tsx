import React from 'react';
import { ShieldAlert, AlertTriangle, Play, FileText, CheckCircle2, Clock, CheckSquare, RotateCcw, Activity } from 'lucide-react';

export interface ActionPreviewData {
  actionId: string;
  incidentId?: string;
  actionType: string;
  actionName: string;
  serviceName: string;
  serviceId: string;
  environment: string;
  why: string;
  preconditions?: string[];
  whatWillHappen: string[];
  expectedImpact: string;
  expectedDuration?: string;
  rollbackStrategy?: string;
  verificationCriteria?: string;
  riskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiresApproval: boolean;
  status: string;
  approvalId?: string;
  createdAt?: string;
}

interface Props {
  preview: ActionPreviewData;
  incidentStatus?: string;
  onReview: () => void;
  onApproveClick: () => void;
  onExecuteClick?: () => void;
  isExecuting?: boolean;
}

export const RemediationActionCard: React.FC<Props> = ({
  preview,
  incidentStatus = '',
  onReview,
  onApproveClick,
  onExecuteClick,
  isExecuting = false,
}) => {
  const getRiskBadgeColor = (level: string) => {
    switch (level) {
      case 'LOW':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'MEDIUM':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'HIGH':
      case 'CRITICAL':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
    }
  };

  const isResolvedOrClosed = ['RESOLVED', 'CLOSED'].includes(incidentStatus);
  const isCompleted = isResolvedOrClosed || ['SUCCEEDED', 'COMPLETED', 'RESOLVED', 'CLOSED'].includes(preview.status);
  const isInProgress = ['EXECUTING', 'VERIFYING'].includes(preview.status) || ['EXECUTING', 'VERIFYING', 'REMEDIATION_EXECUTED'].includes(incidentStatus);
  const isApproved = preview.status === 'APPROVED' || incidentStatus === 'REMEDIATION_APPROVED';

  return (
    <div className="bg-slate-900/90 border border-amber-500/40 rounded-xl p-5 shadow-lg shadow-amber-950/20 backdrop-blur-md transition-all hover:border-amber-500/60 space-y-4">
      {/* Header Badge */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                AI REMEDIATION PLAN
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                PLAN ID: {preview.actionId.substring(0, 10)}
              </span>
            </div>
            <h4 className="text-lg font-bold text-slate-100">{preview.actionName}</h4>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 text-xs font-medium rounded-full border ${getRiskBadgeColor(preview.riskLevel)}`}>
            Risk: {preview.riskLevel} ({preview.riskScore}/100)
          </span>
          {preview.requiresApproval && !isCompleted && !isInProgress && !isApproved && (
            <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              REQUIRES HUMAN APPROVAL
            </span>
          )}
          {isApproved && !isCompleted && (
            <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
              APPROVED — READY FOR EXECUTION
            </span>
          )}
          {isInProgress && !isCompleted && (
            <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30 flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              VERIFYING RECOVERY
            </span>
          )}
          {isCompleted && (
            <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              REMEDIATION VERIFIED
            </span>
          )}
        </div>
      </div>

      {/* Structured Remediation Plan Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Why */}
        <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Why OpsPilot Recommends This
          </span>
          <p className="text-slate-300 leading-relaxed">{preview.why}</p>
        </div>

        {/* Target Service & Environment */}
        <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800 flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              Target Service & Environment
            </span>
            <div className="text-slate-200 font-medium text-sm">
              {preview.serviceName}{' '}
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-amber-400 border border-slate-700 ml-1 uppercase">
                {preview.environment}
              </span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-800/80">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">
              Expected Impact & Duration
            </span>
            <p className="text-slate-300">{preview.expectedImpact}</p>
            <span className="text-[10px] text-slate-400 mt-1 block">Duration: {preview.expectedDuration ?? '~1–3 minutes'}</span>
          </div>
        </div>

        {/* Preconditions */}
        <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-2 flex items-center gap-1">
            <CheckSquare className="w-3.5 h-3.5 text-indigo-400" /> Preconditions Checklist
          </span>
          {preview.preconditions && preview.preconditions.length > 0 ? (
            <ul className="space-y-1.5 text-slate-300">
              {preview.preconditions.map((item, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-400">1. Target service health check confirmed.</p>
          )}
        </div>

        {/* Rollback & Verification Criteria */}
        <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800 space-y-2">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1 flex items-center gap-1">
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" /> Rollback Strategy
            </span>
            <p className="text-slate-300">{preview.rollbackStrategy ?? 'Revert to previous stable operational state if verification fails.'}</p>
          </div>
          <div className="pt-2 border-t border-slate-800/80">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-emerald-400" /> Verification Criteria
            </span>
            <p className="text-slate-300">{preview.verificationCriteria ?? 'CPU < 85%, Error Rate < 1.00%, Latency P99 < 1000ms.'}</p>
          </div>
        </div>

        {/* Step-by-Step Execution Plan */}
        <div className="md:col-span-2 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-2">
            Step-by-Step Execution Sequence
          </span>
          <ul className="space-y-1.5">
            {preview.whatWillHappen.map((step, idx) => (
              <li key={idx} className="flex items-start gap-2 text-slate-300">
                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-slate-800 text-amber-400 flex items-center justify-center text-[10px] font-bold mt-0.5 border border-slate-700">
                  {idx + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Action Footer Controls */}
      <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span>Execution Mode: <strong className="text-purple-400">SIMULATED</strong> (Production Safety Guard Enabled)</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onReview}
            className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            Review Full Plan
          </button>

          {isCompleted ? (
            <span className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              {incidentStatus === 'CLOSED' ? 'Incident Closed' : 'Remediation Verified'}
            </span>
          ) : isApproved ? (
            <button
              onClick={onExecuteClick ?? onApproveClick}
              disabled={isExecuting || isInProgress}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow-md shadow-emerald-950/40 transition-all flex items-center gap-1.5"
            >
              {isInProgress || isExecuting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Executing & Verifying...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Execute Remediation Plan
                </>
              )}
            </button>
          ) : (
            <button
              onClick={onApproveClick}
              disabled={isExecuting || isInProgress}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white shadow-md shadow-blue-950/40 transition-all flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Approve Remediation Plan
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
