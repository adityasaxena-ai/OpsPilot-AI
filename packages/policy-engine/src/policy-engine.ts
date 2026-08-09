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

    // 1. Fetch active policies matching actionType
    const envVal = (ctx.environment || 'production').toLowerCase();
    const envEnum = (['production', 'staging', 'development'].includes(envVal) ? envVal : 'production') as 'production' | 'staging' | 'development';

    const policies = await this.db.policy.findMany({
      where: {
        actionType: ctx.actionType as never,
        isActive: true,
        environment: envEnum,
      },
      orderBy: { maxRiskScore: 'asc' },
    });

    // 2. If no policy defined, use strict default safety rules
    if (policies.length === 0) {
      const requiresApproval = ctx.riskScore > config.MAX_REMEDIATION_RISK_AUTONOMOUS || envEnum === 'production';
      const isAutonomous = config.ENABLE_AUTONOMOUS_REMEDIATION && !requiresApproval;

      return {
        allowed: true,
        requiresApproval: !isAutonomous,
        isAutonomous,
        reason: `Default safety policy applied for ${envEnum} (risk: ${ctx.riskScore}, max autonomous: ${config.MAX_REMEDIATION_RISK_AUTONOMOUS}).`,
      };
    }

    // 3. Find first matching policy
    for (const policy of policies) {
      const policyTier = policy.serviceTier as string;
      if (policyTier && policyTier !== 'T1' && policyTier !== 'T2' && policyTier !== 'T3' && policyTier !== ctx.serviceTier) {
        continue;
      }

      if (ctx.riskScore > policy.maxRiskScore) {
        return {
          allowed: true,
          requiresApproval: true,
          isAutonomous: false,
          policyName: policy.name,
          reason: `Policy "${policy.name}" requires human approval because risk score (${ctx.riskScore}) exceeds max autonomous score (${policy.maxRiskScore}).`,
        };
      }

      return {
        allowed: true,
        requiresApproval: policy.requiresApproval || envEnum === 'production',
        isAutonomous: policy.isAutonomous && envEnum !== 'production',
        policyName: policy.name,
        reason: `Matched policy "${policy.name}".`,
      };
    }

    return {
      allowed: true,
      requiresApproval: true,
      isAutonomous: false,
      reason: 'No fully matching policy rule passed; defaulting to human approval required.',
    };
  }
}
