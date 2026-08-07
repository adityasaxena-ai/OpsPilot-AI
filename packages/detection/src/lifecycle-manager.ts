export type IncidentState =
  | 'DETECTED'
  | 'ACKNOWLEDGED'
  | 'INVESTIGATING'
  | 'MITIGATED'
  | 'RESOLVED'
  | 'CLOSED'
  | 'FAILED';

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
  DETECTED: ['ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED', 'CLOSED'],
  ACKNOWLEDGED: ['INVESTIGATING', 'MITIGATED', 'RESOLVED', 'CLOSED'],
  INVESTIGATING: ['MITIGATED', 'RESOLVED', 'CLOSED', 'FAILED'],
  MITIGATED: ['RESOLVED', 'CLOSED', 'INVESTIGATING'],
  RESOLVED: ['CLOSED', 'INVESTIGATING'],
  CLOSED: ['INVESTIGATING'],
  FAILED: ['INVESTIGATING', 'RESOLVED', 'CLOSED'],
};

export class LifecycleManager {
  validateTransition(context: TransitionContext): TransitionResult {
    const { currentStatus, targetStatus, detectedAt, triagedAt } = context;

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

    // MTTA: Time from DETECTED to ACKNOWLEDGED
    if (targetStatus === 'ACKNOWLEDGED' || targetStatus === 'INVESTIGATING') {
      mttaSeconds = Math.max(1, Math.round((nowMs - startMs) / 1000));
    } else if (triagedAt) {
      mttaSeconds = Math.max(1, Math.round((triagedAt.getTime() - startMs) / 1000));
    }

    // MTTR: Time from DETECTED to RESOLVED
    if (targetStatus === 'RESOLVED' || targetStatus === 'CLOSED') {
      mttrSeconds = Math.max(1, Math.round((nowMs - startMs) / 1000));
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
