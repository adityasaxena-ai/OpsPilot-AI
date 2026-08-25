import type { AssetType, LifecycleStage, GovernancePolicy } from '@prisma/client';

export interface GovernancePolicyEvaluationContext {
  assetType: AssetType;
  currentStage: LifecycleStage;
  targetStage: LifecycleStage;
}

export interface GovernancePolicyEvaluationResult {
  requiresApproval: boolean;
  matchingPolicies: Array<{ id: string; name: string }>;
  reason: string;
}

/**
 * Evaluates whether an AI asset lifecycle transition requires human approval
 * based on active GovernancePolicy definitions matching the asset type and target stage.
 */
export function evaluateGovernancePolicy(
  ctx: GovernancePolicyEvaluationContext,
  policies: GovernancePolicy[]
): GovernancePolicyEvaluationResult {
  const applicablePolicies = policies.filter(
    (p) => p.isActive && p.appliesTo === ctx.assetType
  );

  const matchingPolicies: Array<{ id: string; name: string }> = [];

  for (const policy of applicablePolicies) {
    if (Array.isArray(policy.requiresApprovalFor) && policy.requiresApprovalFor.includes(ctx.targetStage)) {
      matchingPolicies.push({ id: policy.id, name: policy.name });
    }
  }

  const requiresApproval = matchingPolicies.length > 0;
  const reason = requiresApproval
    ? `Transition to ${ctx.targetStage} requires human approval per governance policy: ${matchingPolicies.map((m) => m.name).join(', ')}.`
    : `Transition to ${ctx.targetStage} does not require human approval under current active policies.`;

  return {
    requiresApproval,
    matchingPolicies,
    reason,
  };
}
