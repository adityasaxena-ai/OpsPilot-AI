import { PrismaClient } from '@prisma/client';
import { getConfig } from '@opspilot/config';

export interface PolicyEvaluationResult {
  allowed: boolean;
  requiresApproval: boolean;
  isAutonomous: boolean;
  policyName?: string;
  reason: string;
}

export interface PolicyEvaluationContext {
  actionType: string;
  serviceTier: string;
  environment: string;
  riskScore: number;
}

export class PolicyEngine {
  constructor(private db: PrismaClient) {}

  async evaluate(ctx: PolicyEvaluationContext): Promise<PolicyEvaluationResult> {
    const config = getConfig();

    // 1. Fetch active policies matching actionType and environment
    const policies = await this.db.policy.findMany({
      where: {
        actionType: ctx.actionType as never,
        isActive: true,
        OR: [
          { environment: ctx.environment as never },
          { environment: 'ALL' as never },
        ],
      },
      orderBy: { maxRiskScore: 'asc' },
    });

    // 2. If no policy defined, use strict default safety rules
    if (policies.length === 0) {
      const requiresApproval = ctx.riskScore > config.MAX_REMEDIATION_RISK_AUTONOMOUS;
      const isAutonomous = config.ENABLE_AUTONOMOUS_REMEDIATION && !requiresApproval;

      return {
        allowed: true,
        requiresApproval: !isAutonomous,
        isAutonomous,
        reason: `Default safety policy applied (risk: ${ctx.riskScore}, max autonomous: ${config.MAX_REMEDIATION_RISK_AUTONOMOUS}).`,
      };
    }

    // 3. Find first matching policy
    for (const policy of policies) {
      // Check tier filter
      const policyTier = policy.serviceTier as string;
      if (policyTier && policyTier !== 'ALL' && policyTier !== ctx.serviceTier) {
        continue;
      }

      // Check risk score ceiling
      if (ctx.riskScore > policy.maxRiskScore) {
        return {
          allowed: true,
          requiresApproval: true,
          isAutonomous: false,
          policyName: policy.name,
          reason: `Action risk score (${ctx.riskScore}) exceeds policy "${policy.name}" max risk score (${policy.maxRiskScore}). Human approval required.`,
        };
      }

      // Evaluate approval & autonomous flags
      const requiresApproval = policy.requiresApproval || ctx.riskScore > config.MAX_REMEDIATION_RISK_AUTONOMOUS;
      const isAutonomous = policy.isAutonomous && config.ENABLE_AUTONOMOUS_REMEDIATION && !requiresApproval;

      return {
        allowed: true,
        requiresApproval: !isAutonomous,
        isAutonomous,
        policyName: policy.name,
        reason: `Matched policy "${policy.name}". ${requiresApproval ? 'Human approval required.' : 'Autonomous execution allowed.'}`,
      };
    }

    // Default safety fallback
    return {
      allowed: true,
      requiresApproval: true,
      isAutonomous: false,
      reason: 'Strict safety fallback — human approval required for non-matched policy combinations.',
    };
  }
}
