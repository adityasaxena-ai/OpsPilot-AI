import { describe, it, expect } from 'vitest';
import { calculateGovernanceRisk } from '@opspilot/risk-engine';

describe('Governance Risk Scoring Engine', () => {
  it('calculates LOW risk score for non-production internal prompts', () => {
    const res = calculateGovernanceRisk({
      assetType: 'PROMPT',
      isProductionFacing: false,
      dataSensitivity: 'INTERNAL',
      historicalIncidentsCount: 0,
    });

    // PROMPT (15) + Non-prod (10) + INTERNAL (10) + Incidents (0) = 35 -> MEDIUM
    expect(res.riskScore).toBe(35);
    expect(res.riskLevel).toBe('MEDIUM');
  });

  it('calculates CRITICAL risk score for production-facing AGENT with PII and history', () => {
    const res = calculateGovernanceRisk({
      assetType: 'AGENT',
      isProductionFacing: true,
      dataSensitivity: 'RESTRICTED_PII',
      historicalIncidentsCount: 3,
    });

    // AGENT (30) + Prod (25) + PII (25) + 3*5 (15) = 95 -> CRITICAL
    expect(res.riskScore).toBe(95);
    expect(res.riskLevel).toBe('CRITICAL');
  });

  it('degrades gracefully with minimal inputs', () => {
    const res = calculateGovernanceRisk({
      assetType: 'MODEL',
    });

    // MODEL (25) + Non-prod default (10) + INTERNAL default (10) + 0 incidents = 45 -> MEDIUM
    expect(res.riskScore).toBe(45);
    expect(res.riskLevel).toBe('MEDIUM');
    expect(res.explanation).toContain('Governance Risk Score: 45/100');
  });
});
