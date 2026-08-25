import { describe, it, expect } from 'vitest';
import { evaluateGovernancePolicy } from '@opspilot/policy-engine';
import type { GovernancePolicy } from '@prisma/client';

describe('Governance Policy Evaluation Logic', () => {
  const samplePolicies: GovernancePolicy[] = [
    {
      id: 'pol-1',
      name: 'Model Promotion Policy',
      description: 'Requires approval for APPROVED or LIVE',
      appliesTo: 'MODEL',
      requiresApprovalFor: ['APPROVED', 'LIVE'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'pol-2',
      name: 'Prompt Live Policy',
      description: 'Requires approval for LIVE only',
      appliesTo: 'PROMPT',
      requiresApprovalFor: ['LIVE'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'pol-3',
      name: 'Disabled Policy',
      description: 'Disabled policy',
      appliesTo: 'MODEL',
      requiresApprovalFor: ['EVALUATED'],
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it('requires approval when target stage matches active policy', () => {
    const res = evaluateGovernancePolicy(
      { assetType: 'MODEL', currentStage: 'PROPOSED', targetStage: 'APPROVED' },
      samplePolicies
    );

    expect(res.requiresApproval).toBe(true);
    expect(res.matchingPolicies.length).toBe(1);
    expect(res.matchingPolicies[0]?.name).toBe('Model Promotion Policy');
  });

  it('auto-approves when target stage is not in requiresApprovalFor', () => {
    const res = evaluateGovernancePolicy(
      { assetType: 'MODEL', currentStage: 'PROPOSED', targetStage: 'EVALUATED' },
      samplePolicies
    );

    expect(res.requiresApproval).toBe(false);
    expect(res.matchingPolicies.length).toBe(0);
  });

  it('ignores inactive/disabled policies', () => {
    const res = evaluateGovernancePolicy(
      { assetType: 'MODEL', currentStage: 'PROPOSED', targetStage: 'EVALUATED' },
      samplePolicies
    );

    expect(res.requiresApproval).toBe(false);
  });

  it('correctly evaluates asset-type specific policy rules', () => {
    const promptRes = evaluateGovernancePolicy(
      { assetType: 'PROMPT', currentStage: 'EVALUATED', targetStage: 'APPROVED' },
      samplePolicies
    );
    expect(promptRes.requiresApproval).toBe(false);

    const promptLiveRes = evaluateGovernancePolicy(
      { assetType: 'PROMPT', currentStage: 'APPROVED', targetStage: 'LIVE' },
      samplePolicies
    );
    expect(promptLiveRes.requiresApproval).toBe(true);
  });
});
