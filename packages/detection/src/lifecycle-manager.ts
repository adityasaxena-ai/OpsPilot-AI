export type IncidentState =
  | 'DETECTED'
  | 'ACKNOWLEDGED'
  | 'TRIAGED'
  | 'CORRELATED'
  | 'INVESTIGATING'
  | 'RCA_IDENTIFIED'
  | 'REMEDIATION_PROPOSED'
  | 'AWAITING_APPROVAL'
  | 'REMEDIATION_APPROVED'
  | 'REMEDIATION_EXECUTED'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'RESOLVED'
  | 'CLOSED'
  | 'FAILED'
  | 'ESCALATED'
  | 'LEARNING';

export interface TransitionContext {
  currentStatus: IncidentState;
  targetStatus: IncidentState;
  detectedAt: Date;
  triagedAt?: Date | null;
  resolvedAt?: Date | null;
  closedAt?: Date | null;
}

export interface TransitionResult {
  allowed: boolean;
  newStatus: IncidentState;
  mttdSeconds?: number | undefined;
  mttaSeconds?: number | undefined;
  mttrSeconds?: number | undefined;
  reason?: string | undefined;
}

const ALLOWED_TRANSITIONS: Record<IncidentState, IncidentState[]> = {
  DETECTED: ['ACKNOWLEDGED', 'TRIAGED', 'CORRELATED', 'INVESTIGATING', 'RESOLVED', 'CLOSED'],
  ACKNOWLEDGED: ['INVESTIGATING', 'RCA_IDENTIFIED', 'RESOLVED', 'CLOSED'],
  TRIAGED: ['INVESTIGATING', 'RCA_IDENTIFIED', 'RESOLVED', 'CLOSED'],
  CORRELATED: ['INVESTIGATING', 'RCA_IDENTIFIED', 'RESOLVED', 'CLOSED'],
  INVESTIGATING: ['RCA_IDENTIFIED', 'REMEDIATION_PROPOSED', 'AWAITING_APPROVAL', 'RESOLVED', 'CLOSED', 'FAILED'],
  RCA_IDENTIFIED: ['REMEDIATION_PROPOSED', 'AWAITING_APPROVAL', 'REMEDIATION_APPROVED', 'EXECUTING', 'RESOLVED', 'CLOSED'],
  REMEDIATION_PROPOSED: ['AWAITING_APPROVAL', 'REMEDIATION_APPROVED', 'EXECUTING', 'RESOLVED', 'CLOSED'],
  AWAITING_APPROVAL: ['REMEDIATION_APPROVED', 'REMEDIATION_EXECUTED', 'EXECUTING', 'VERIFYING', 'RESOLVED', 'CLOSED', 'FAILED'],
  REMEDIATION_APPROVED: ['REMEDIATION_EXECUTED', 'EXECUTING', 'VERIFYING', 'RESOLVED', 'CLOSED', 'FAILED'],
  REMEDIATION_EXECUTED: ['VERIFYING', 'RESOLVED', 'CLOSED', 'FAILED'],
  EXECUTING: ['REMEDIATION_EXECUTED', 'VERIFYING', 'RESOLVED', 'CLOSED', 'FAILED'],
  VERIFYING: ['RESOLVED', 'FAILED', 'INVESTIGATING', 'CLOSED'],
  RESOLVED: ['CLOSED', 'INVESTIGATING'],
  CLOSED: [],
  FAILED: ['INVESTIGATING', 'RESOLVED', 'CLOSED'],
  ESCALATED: ['INVESTIGATING', 'RESOLVED', 'CLOSED'],
  LEARNING: ['RESOLVED', 'CLOSED'],
};

export class LifecycleManager {
  validateTransition(context: TransitionContext): TransitionResult {
    const { currentStatus, targetStatus, detectedAt, triagedAt, resolvedAt } = context;

    const allowed = ALLOWED_TRANSITIONS[currentStatus]?.includes(targetStatus) ?? false;
    if (!allowed) {
      return {
        allowed: false,
        newStatus: currentStatus,
        reason: `Transition from ${currentStatus} to ${targetStatus} is not permitted in lifecycle state machine`,
      };
    }

    const now = new Date();
    let mttdSeconds: number | undefined;
    let mttaSeconds: number | undefined;
    let mttrSeconds: number | undefined;

    const startMs = detectedAt.getTime();
    const nowMs = now.getTime();

    // MTTD: Time from creation to DETECTED (typically instantaneous or <10s)
    mttdSeconds = Math.max(1, Math.round((nowMs - startMs) / 1000));

    // MTTA: Time from DETECTED to ACKNOWLEDGED / INVESTIGATING
    if (targetStatus === 'ACKNOWLEDGED' || targetStatus === 'INVESTIGATING') {
      mttaSeconds = Math.max(1, Math.round((nowMs - startMs) / 1000));
    } else if (triagedAt) {
      mttaSeconds = Math.max(1, Math.round((triagedAt.getTime() - startMs) / 1000));
    }

    // MTTR: Time from DETECTED to RESOLVED (preserve on CLOSED)
    if (targetStatus === 'RESOLVED') {
      mttrSeconds = Math.max(1, Math.round((nowMs - startMs) / 1000));
    } else if (targetStatus === 'CLOSED') {
      const resolvedTime = resolvedAt ?? now;
      mttrSeconds = Math.max(1, Math.round((resolvedTime.getTime() - startMs) / 1000));
    }

    return {
      allowed: true,
      newStatus: targetStatus,
      mttdSeconds,
      mttaSeconds,
      mttrSeconds,
    };
  }
}
