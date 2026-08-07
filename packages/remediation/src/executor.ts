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

export class RemediationExecutor {
  private registry = new ToolRegistry();

  constructor(private db: PrismaClient) {}

  async proposeAction(input: ProposeActionInput): Promise<ProposeActionResult> {
    // 1. Tool check
    const tool = this.registry.get(input.actionType);
    if (!tool) {
      throw new Error(`Unknown remediation action type: ${input.actionType}`);
    }

    // 2. Fetch service & incident
    const incident = await this.db.incident.findUnique({
      where: { id: input.incidentId },
      include: { service: true },
    });

    if (!incident || !incident.service) {
      throw new Error(`Incident ${input.incidentId} not found`);
    }

    // 3. Dynamic import of RiskEngine & PolicyEngine to prevent circular workspace build deps
    const { RiskEngine } = await import('@opspilot/risk-engine');
    const { PolicyEngine } = await import('@opspilot/policy-engine');

    const riskEngine = new RiskEngine(this.db);
    const policyEngine = new PolicyEngine(this.db);

    // 4. Calculate Risk
    const riskRes = await riskEngine.calculateRisk({
      actionType: input.actionType,
      serviceId: input.serviceId,
      environment: incident.environment,
    });

    // 5. Evaluate Policy
    const policyRes = await policyEngine.evaluate({
      actionType: input.actionType,
      serviceTier: incident.service.tier,
      environment: incident.environment,
      riskScore: riskRes.riskScore,
    });

    const status = policyRes.requiresApproval ? 'AWAITING_APPROVAL' : 'APPROVED';

    // 6. Create Remediation Action Record
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

    // 7. If approval required, create Approval Request
    if (policyRes.requiresApproval) {
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
      requiresApproval: policyRes.requiresApproval,
      ...(approvalId ? { approvalId } : {}),
      reason: policyRes.reason,
    };
  }

  async executeAction(actionId: string, approvedById?: string): Promise<Record<string, unknown>> {
    const action = await this.db.remediationAction.findUnique({
      where: { id: actionId },
      include: { incident: { include: { service: true } } },
    });

    if (!action) throw new Error(`Remediation action ${actionId} not found`);

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

    // Audit log entry
    await this.db.auditLog.create({
      data: {
        action: `REMEDIATION_EXECUTED_${action.actionType}`,
        actorType: approvedById ? 'USER' : 'AI',
        actorId: approvedById ?? null,
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
        eventType: execRes.success ? 'REMEDIATION_EXECUTED' : 'REMEDIATION_FAILED',
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
}
