import { PrismaClient } from '@prisma/client';
import { ToolRegistry } from './tool-registry.js';

export interface ProposeActionInput {
  incidentId: string;
  actionType: string;
  serviceId: string;
  rationale: string;
  proposedByAi?: boolean;
}

export interface ProposeActionResult {
  actionId: string;
  status: string;
  riskScore: number;
  riskLevel: string;
  requiresApproval: boolean;
  approvalId?: string;
  reason: string;
}

export interface ActionPreviewResult {
  actionId: string;
  incidentId: string;
  actionType: string;
  actionName: string;
  serviceName: string;
  serviceId: string;
  environment: string;
  why: string;
  preconditions: string[];
  whatWillHappen: string[];
  expectedImpact: string;
  expectedDuration: string;
  rollbackStrategy: string;
  verificationCriteria: string;
  riskScore: number;
  riskLevel: string;
  requiresApproval: boolean;
  status: string;
  approvalId?: string;
  createdAt: string;
}

export class RemediationExecutor {
  private registry = new ToolRegistry();

  constructor(private db: PrismaClient) {}

  async proposeAction(input: ProposeActionInput): Promise<ProposeActionResult> {
    // 1. Tool check
    const tool = this.registry.get(input.actionType);
    if (!tool) {
      const err = new Error(`Unknown remediation action type: ${input.actionType}`);
      (err as unknown as { statusCode: number }).statusCode = 400;
      throw err;
    }

    // 2. Fetch service & incident
    const incident = await this.db.incident.findUnique({
      where: { id: input.incidentId },
      include: { service: true },
    });

    if (!incident || !incident.service) {
      const err = new Error(`Incident ${input.incidentId} not found`);
      (err as unknown as { statusCode: number }).statusCode = 404;
      throw err;
    }

    // 2.5 Incident Lifecycle Guard: Reject proposal if incident is RESOLVED or CLOSED
    if (['RESOLVED', 'CLOSED'].includes(incident.status)) {
      const err = new Error(
        `[InvalidState] Incident ${incident.id} is already ${incident.status}. Remediation is disabled.`
      );
      (err as unknown as { statusCode: number }).statusCode = 400;
      throw err;
    }

    // 3. Check for existing active remediation on this incident
    const existingActiveAction = await this.db.remediationAction.findFirst({
      where: {
        incidentId: input.incidentId,
        status: { in: ['AWAITING_APPROVAL', 'APPROVED', 'EXECUTING'] },
      },
      include: { approval: true },
    });

    if (existingActiveAction) {
      return {
        actionId: existingActiveAction.id,
        status: existingActiveAction.status,
        riskScore: existingActiveAction.riskScore,
        riskLevel: existingActiveAction.riskLevel,
        requiresApproval: existingActiveAction.status === 'AWAITING_APPROVAL',
        ...(existingActiveAction.approval?.id ? { approvalId: existingActiveAction.approval.id } : {}),
        reason: `An active remediation action (${existingActiveAction.actionType}) is already in state ${existingActiveAction.status}.`,
      };
    }

    // 4. Dynamic import of RiskEngine & PolicyEngine to prevent circular workspace build deps
    const { RiskEngine } = await import('@opspilot/risk-engine');
    const { PolicyEngine } = await import('@opspilot/policy-engine');

    const riskEngine = new RiskEngine(this.db);
    const policyEngine = new PolicyEngine(this.db);

    // 5. Calculate Risk
    const riskRes = await riskEngine.calculateRisk({
      actionType: input.actionType,
      serviceId: input.serviceId,
      environment: incident.environment,
    });

    // 6. Evaluate Policy
    const policyRes = await policyEngine.evaluate({
      actionType: input.actionType,
      serviceTier: incident.service.tier,
      environment: incident.environment,
      riskScore: riskRes.riskScore,
    });

    // 7. Layer 2 Safety Check — Force approval if Environment is production
    let requiresApproval = policyRes.requiresApproval;
    let policyReason = policyRes.reason;

    if (incident.environment === 'production' || incident.service.environment === 'production') {
      requiresApproval = true;
      policyReason = 'Production state-changing action requires explicit human confirmation.';
    }

    const status = requiresApproval ? 'AWAITING_APPROVAL' : 'APPROVED';

    // 8. Create Remediation Action Record
    const action = await this.db.remediationAction.create({
      data: {
        incidentId: input.incidentId,
        actionType: input.actionType as never,
        status: status as never,
        riskScore: riskRes.riskScore,
        riskLevel: riskRes.riskLevel as never,
        riskFactors: riskRes.factors as never,
        proposedByAi: input.proposedByAi ?? true,
        proposedAt: new Date(),
      },
    });

    let approvalId: string | undefined;

    // 9. If approval required, create Approval Request
    if (requiresApproval) {
      const approval = await this.db.approval.create({
        data: {
          remediationActionId: action.id,
          incidentId: input.incidentId,
          status: 'PENDING',
          aiRecommendation: input.rationale,
          riskSummary: riskRes.explanation,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });
      approvalId = approval.id;

      // Update incident status
      await this.db.incident.update({
        where: { id: input.incidentId },
        data: { status: 'AWAITING_APPROVAL' },
      });

      await this.db.incidentEvent.create({
        data: {
          incidentId: input.incidentId,
          eventType: 'APPROVAL_REQUESTED',
          actorType: 'SYSTEM',
          description: `Human approval requested for ${input.actionType} (Risk: ${riskRes.riskScore}/100 ${riskRes.riskLevel})`,
          metadata: { actionId: action.id, approvalId: approval.id, riskScore: riskRes.riskScore },
        },
      });
    } else {
      await this.db.incident.update({
        where: { id: input.incidentId },
        data: { status: 'REMEDIATION_PROPOSED' },
      });
    }

    return {
      actionId: action.id,
      status,
      riskScore: riskRes.riskScore,
      riskLevel: riskRes.riskLevel,
      requiresApproval,
      ...(approvalId ? { approvalId } : {}),
      reason: policyReason,
    };
  }

  async executeAction(actionId: string, approvedById?: string): Promise<Record<string, unknown>> {
    const action = await this.db.remediationAction.findUnique({
      where: { id: actionId },
      include: { incident: { include: { service: true } } },
    });

    if (!action || !action.incident) {
      const err = new Error(`Remediation action ${actionId} not found`);
      (err as unknown as { statusCode: number }).statusCode = 404;
      throw err;
    }

    // 1. Incident Lifecycle Guard
    if (['RESOLVED', 'CLOSED'].includes(action.incident.status)) {
      const err = new Error(
        `[InvalidState] Incident ${action.incident.id} is already ${action.incident.status}. Remediation execution is disabled.`
      );
      (err as unknown as { statusCode: number }).statusCode = 400;
      throw err;
    }

    // 2. Concurrency Guard
    if (['EXECUTING', 'SUCCEEDED'].includes(action.status)) {
      const err = new Error(`[ConcurrencyConflict] Action ${actionId} is already in state ${action.status}`);
      (err as unknown as { statusCode: number }).statusCode = 409;
      throw err;
    }

    // 3. HUMAN APPROVAL GATE GUARD
    if (action.status !== 'APPROVED') {
      const err = new Error(
        `[Forbidden] Action ${actionId} is in state ${action.status} and cannot be executed without explicit human approval.`
      );
      (err as unknown as { statusCode: number }).statusCode = 403;
      throw err;
    }

    // 4. Operator Authorization Guard in Production Mode
    if (process.env.NODE_ENV === 'production' && !approvedById) {
      const err = new Error(`[Unauthorized] Production remediation approval requires an authenticated operator identity.`);
      (err as unknown as { statusCode: number }).statusCode = 401;
      throw err;
    }

    const tool = this.registry.get(action.actionType);
    if (!tool) throw new Error(`Unknown action tool: ${action.actionType}`);

    // Update status to EXECUTING & REMEDIATION_EXECUTED
    await this.db.remediationAction.update({
      where: { id: actionId },
      data: { status: 'EXECUTING', executedAt: new Date() },
    });

    await this.db.incident.update({
      where: { id: action.incidentId },
      data: { status: 'REMEDIATION_EXECUTED' },
    });

    await this.db.incidentEvent.create({
      data: {
        incidentId: action.incidentId,
        eventType: 'REMEDIATION_EXECUTION_STARTED',
        actorType: approvedById ? 'USER' : 'AI',
        description: `Started execution of remediation action: ${action.actionType} [EXECUTION MODE: SIMULATED]`,
        metadata: { actionId, executionMode: 'SIMULATED' },
      },
    });

    // Execute tool
    const execRes = await tool.execute(action.incident.serviceId, {}, this.db);
    const finalStatus = execRes.success ? 'SUCCEEDED' : 'FAILED';

    // Update action outcome
    await this.db.remediationAction.update({
      where: { id: actionId },
      data: {
        status: finalStatus as never,
        completedAt: new Date(),
        executionLog: execRes.executionLog,
      },
    });

    let validUserId: string | null = null;
    if (approvedById) {
      const user = await this.db.user.findFirst();
      if (user) validUserId = user.id;
    }

    await this.db.auditLog.create({
      data: {
        action: `REMEDIATION_EXECUTED_${action.actionType}`,
        actorType: approvedById ? 'USER' : 'AI',
        actorId: validUserId,
        targetType: 'SERVICE',
        targetId: action.incident.serviceId,
        incidentId: action.incidentId,
        riskScore: action.riskScore,
        result: execRes.success ? 'SUCCESS' : 'FAILURE',
        metadata: { actionId, log: execRes.executionLog, executionMode: 'SIMULATED' },
      },
    });

    await this.db.incidentEvent.create({
      data: {
        incidentId: action.incidentId,
        eventType: execRes.success ? 'REMEDIATION_EXECUTION_COMPLETED' : 'REMEDIATION_EXECUTION_FAILED',
        actorType: approvedById ? 'USER' : 'AI',
        description: `${execRes.message} [EXECUTION MODE: SIMULATED]`,
        metadata: { actionId, success: execRes.success },
      },
    });

    // Transition to VERIFYING
    if (execRes.success) {
      await this.db.incident.update({
        where: { id: action.incidentId },
        data: { status: 'VERIFYING' },
      });
    }

    return {
      actionId,
      success: execRes.success,
      message: execRes.message,
      executionLog: execRes.executionLog,
      executionMode: 'SIMULATED',
    };
  }

  async getActionPreview(actionId: string): Promise<ActionPreviewResult> {
    const action = await this.db.remediationAction.findUnique({
      where: { id: actionId },
      include: {
        incident: { include: { service: true } },
        approval: true,
      },
    });

    if (!action || !action.incident || !action.incident.service) {
      throw new Error(`Remediation action ${actionId} not found`);
    }

    const serviceName = action.incident.service.name;
    const env = action.incident.environment;

    let actionName = action.actionType.replace('_', ' ');
    let preconditions: string[] = [];
    let whatWillHappen: string[] = [];
    let expectedImpact = 'Minor transient impact possible during execution.';
    let expectedDuration = '~1–3 minutes';
    let rollbackStrategy = 'Revert to previous stable operational state if verification fails.';
    let verificationCriteria = 'CPU < 85%, Error Rate < 1.00%, Latency P99 < 1000ms, Service Health = HEALTHY.';

    switch (action.actionType) {
      case 'ROLLBACK_DEPLOYMENT':
        actionName = `Rollback ${serviceName}`;
        preconditions = [
          `1. Confirm active deployment contains elevated memory or unindexed query regressions.`,
          `2. Verify target previous stable build exists in deployment registry.`,
          `3. Confirm database migration backward compatibility.`,
        ];
        whatWillHappen = [
          `1. Initiate graceful container pod termination across ${serviceName} worker pool.`,
          `2. Roll back container image tag to previous stable release build.`,
          `3. Monitor readiness probes, startup logs, and thread pool initialization.`,
          `4. Re-route incoming traffic to healthy rolled-back instance pool.`,
        ];
        expectedImpact = 'Temporary brief latency blip during pod replacement (~1–2 mins).';
        expectedDuration = '~1–3 minutes';
        rollbackStrategy = 'Re-deploy original build image tag if rollback fails readiness checks.';
        verificationCriteria = 'CPU < 85%, Error Rate < 1.00%, Latency P99 < 1000ms, Service Health = HEALTHY.';
        break;

      case 'RESTART_SERVICE':
        actionName = `Restart ${serviceName}`;
        preconditions = [
          `1. Confirm target service process is active and receiving requests.`,
          `2. Check active request queue depth and database pool connections.`,
          `3. Verify standby failover replica is online.`,
        ];
        whatWillHappen = [
          `1. Perform a graceful rolling restart of all ${serviceName} instances.`,
          `2. Drain active connection pools cleanly before process termination.`,
          `3. Monitor process startup, thread pools, and readiness probes.`,
          `4. Verify service health after all instances reach ready state.`,
        ];
        expectedImpact = 'Possible brief connection retries for active in-flight requests.';
        expectedDuration = '~1–2 minutes';
        rollbackStrategy = 'Keep remaining pods active if restarted pod fails readiness probe.';
        verificationCriteria = 'CPU < 80%, Error Rate < 0.50%, Latency P99 < 500ms, Service Health = HEALTHY.';
        break;

      case 'SCALE_SERVICE':
        actionName = `Scale Up ${serviceName}`;
        preconditions = [
          `1. Verify cluster worker node resource capacity for instance expansion.`,
          `2. Check load balancer auto-target registration settings.`,
        ];
        whatWillHappen = [
          `1. Increase worker node / replica count for ${serviceName} by +50%.`,
          `2. Distribute incoming traffic across expanded instance pool.`,
          `3. Relieve CPU and thread contention.`,
          `4. Verify load balancing and metric stabilization.`,
        ];
        expectedImpact = 'No downtime. Minor temporary cloud resource usage increase.';
        expectedDuration = '~2–3 minutes';
        rollbackStrategy = 'Scale back to original replica count if load balancer registration fails.';
        verificationCriteria = 'CPU < 70%, Error Rate < 0.20%, Latency P99 < 300ms, Service Health = HEALTHY.';
        break;

      case 'CLEAR_CACHE':
        actionName = `Flush Cache for ${serviceName}`;
        preconditions = [
          `1. Check Redis cluster memory usage and connection count.`,
          `2. Confirm primary database read replica capacity for cache re-hydration.`,
        ];
        whatWillHappen = [
          `1. Flush stale key-value entries in Redis cache namespace for ${serviceName}.`,
          `2. Trigger warm-up queries for high-frequency cache keys.`,
          `3. Monitor database query latency and cache hit ratios post-flush.`,
        ];
        expectedImpact = 'Brief transient increase in database read queries during cache warmup.';
        expectedDuration = '~30–60 seconds';
        rollbackStrategy = 'Re-populate critical cache keys from snapshot if database load exceeds 90%.';
        verificationCriteria = 'Cache Hit Ratio > 90%, Error Rate < 0.10%, Database Load < 75%.';
        break;

      case 'RETRY_BATCH':
        actionName = `Retry Failed Batches for ${serviceName}`;
        preconditions = [
          `1. Confirm dead-letter queue contains failed processing items.`,
          `2. Verify database write lock availability.`,
        ];
        whatWillHappen = [
          `1. Re-queue dead-lettered / failed processing batch jobs for ${serviceName}.`,
          `2. Process failed items with exponential backoff safety controls.`,
          `3. Verify batch queue drain rates and error rates.`,
        ];
        expectedImpact = 'Increased background job processing load (~2–5 mins).';
        expectedDuration = '~2–5 minutes';
        rollbackStrategy = 'Pause batch re-queue if error rate exceeds 5%.';
        verificationCriteria = 'Queue Depth = 0, Error Rate < 0.50%, Processing Success > 99%.';
        break;

      default:
        actionName = `Execute ${action.actionType} on ${serviceName}`;
        preconditions = [`1. Check target service operational state.`];
        whatWillHappen = [
          `1. Execute targeted remediation action on ${serviceName}.`,
          `2. Monitor operational health metrics post-execution.`,
        ];
        break;
    }

    return {
      actionId: action.id,
      incidentId: action.incidentId,
      actionType: action.actionType,
      actionName,
      serviceName,
      serviceId: action.incident.serviceId,
      environment: env,
      why: action.approval?.aiRecommendation || 'Recent metrics and logs indicate operational degradation requiring intervention.',
      preconditions,
      whatWillHappen,
      expectedImpact,
      expectedDuration,
      rollbackStrategy,
      verificationCriteria,
      riskScore: action.riskScore,
      riskLevel: action.riskLevel,
      requiresApproval: action.status === 'AWAITING_APPROVAL' || env === 'production',
      status: action.status,
      ...(action.approval?.id ? { approvalId: action.approval.id } : {}),
      createdAt: action.createdAt.toISOString(),
    };
  }
}
