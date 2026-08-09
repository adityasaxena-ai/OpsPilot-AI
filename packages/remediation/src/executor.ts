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
  actionType: string;
  actionName: string;
  serviceName: string;
  serviceId: string;
  environment: string;
  why: string;
  whatWillHappen: string[];
  expectedImpact: string;
  riskScore: number;
  riskLevel: string;
  requiresApproval: boolean;
  status: string;
  approvalId?: string;
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

    // 3. Check for existing active remediation on this incident (Idempotency / Concurrency protection)
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
          expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15-min expiry
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

    // 1. Incident Lifecycle Guard: Reject execution if incident is RESOLVED or CLOSED
    if (['RESOLVED', 'CLOSED'].includes(action.incident.status)) {
      const err = new Error(
        `[InvalidState] Incident ${action.incident.id} is already ${action.incident.status}. Remediation execution is disabled.`
      );
      (err as unknown as { statusCode: number }).statusCode = 400;
      throw err;
    }

    // 2. Concurrency & Double-Click Guard:
    if (['EXECUTING', 'SUCCEEDED'].includes(action.status)) {
      const err = new Error(`[ConcurrencyConflict] Action ${actionId} is already in state ${action.status}`);
      (err as unknown as { statusCode: number }).statusCode = 409;
      throw err;
    }

    // 3. CRITICAL HUMAN APPROVAL GATE GUARD:
    // Only 'APPROVED' actions may enter execution!
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

    // Update status to EXECUTING
    await this.db.remediationAction.update({
      where: { id: actionId },
      data: { status: 'EXECUTING', executedAt: new Date() },
    });

    await this.db.incident.update({
      where: { id: action.incidentId },
      data: { status: 'EXECUTING' },
    });

    await this.db.incidentEvent.create({
      data: {
        incidentId: action.incidentId,
        eventType: 'REMEDIATION_EXECUTION_STARTED',
        actorType: approvedById ? 'USER' : 'AI',
        description: `Started execution of remediation action: ${action.actionType}`,
        metadata: { actionId },
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

    // Lookup valid user ID if approvedById passed
    let validUserId: string | null = null;
    if (approvedById) {
      const user = await this.db.user.findFirst();
      if (user) validUserId = user.id;
    }

    // Audit log entry
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
        metadata: { actionId, log: execRes.executionLog },
      },
    });

    await this.db.incidentEvent.create({
      data: {
        incidentId: action.incidentId,
        eventType: execRes.success ? 'REMEDIATION_EXECUTION_COMPLETED' : 'REMEDIATION_EXECUTION_FAILED',
        actorType: approvedById ? 'USER' : 'AI',
        description: execRes.message,
        metadata: { actionId, success: execRes.success },
      },
    });

    // If successful, trigger post-remediation metric verification!
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
    let whatWillHappen: string[] = [];
    let expectedImpact = 'Minor transient impact possible during execution.';

    switch (action.actionType) {
      case 'ROLLBACK_DEPLOYMENT':
        actionName = `Rollback ${serviceName}`;
        whatWillHappen = [
          `Roll back ${serviceName} to the previous stable deployment build.`,
          `Replace active container pods/instances with the previous version.`,
          `Monitor CPU, latency, and error rate during rollout.`,
          `Verify service health and confirm incident resolution.`,
        ];
        expectedImpact = 'Temporary brief latency blip during pod replacement (~1–2 mins).';
        break;

      case 'RESTART_SERVICE':
        actionName = `Restart ${serviceName}`;
        whatWillHappen = [
          `Perform a graceful rolling restart of all ${serviceName} instances.`,
          `Drain active connection pools cleanly before process termination.`,
          `Monitor process startup, thread pools, and readiness probes.`,
          `Verify service health after all instances reach ready state.`,
        ];
        expectedImpact = 'Possible brief connection retries for active in-flight requests.';
        break;

      case 'SCALE_SERVICE':
        actionName = `Scale Up ${serviceName}`;
        whatWillHappen = [
          `Increase worker node / replica count for ${serviceName} by +50%.`,
          `Distribute incoming traffic across expanded instance pool.`,
          `Relieve CPU and thread contention.`,
          `Verify load balancing and metric stabilization.`,
        ];
        expectedImpact = 'No downtime. Minor temporary cloud resource usage increase.';
        break;

      case 'CLEAR_CACHE':
        actionName = `Flush Cache for ${serviceName}`;
        whatWillHappen = [
          `Flush stale key-value entries in Redis cache for ${serviceName}.`,
          `Force cache re-hydration from backend database.`,
          `Monitor database query latency and cache hit ratios post-flush.`,
        ];
        expectedImpact = 'Brief transient increase in database read queries during cache warmup.';
        break;

      case 'RETRY_BATCH':
        actionName = `Retry Failed Batches for ${serviceName}`;
        whatWillHappen = [
          `Re-queue dead-lettered / failed processing batch jobs for ${serviceName}.`,
          `Process failed items with exponential backoff safety controls.`,
          `Verify batch queue drain rates and error rates.`,
        ];
        expectedImpact = 'Increased background job processing load (~2–5 mins).';
        break;

      default:
        actionName = `Execute ${action.actionType} on ${serviceName}`;
        whatWillHappen = [
          `Execute targeted remediation action on ${serviceName}.`,
          `Monitor operational health metrics post-execution.`,
        ];
        break;
    }

    return {
      actionId: action.id,
      actionType: action.actionType,
      actionName,
      serviceName,
      serviceId: action.incident.serviceId,
      environment: env,
      why: action.approval?.aiRecommendation || 'Recent metrics and logs indicate operational degradation requiring intervention.',
      whatWillHappen,
      expectedImpact,
      riskScore: action.riskScore,
      riskLevel: action.riskLevel,
      requiresApproval: action.status === 'AWAITING_APPROVAL' || env === 'production',
      status: action.status,
      ...(action.approval?.id ? { approvalId: action.approval.id } : {}),
    };
  }
}
