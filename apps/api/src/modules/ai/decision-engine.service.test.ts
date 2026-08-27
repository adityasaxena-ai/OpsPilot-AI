import { describe, it, expect } from 'vitest';
import { buildIncidentDecisionSupport } from './decision-engine.service.js';
import { buildRcaInvestigation } from './rca-engine.service.js';
import type { ChangeCorrelationResult } from './change-correlation.service.js';

describe('Incident Decision Support Engine', () => {
  const mockIncident = {
    id: 'inc-dec-001',
    detectedAt: new Date('2026-08-17T10:00:00Z'),
    severity: 'P1',
    status: 'INVESTIGATING',
    service: { id: 'srv-1', name: 'Payments Service', tier: 'T1' },
    remediations: [
      { id: 'rem-1', actionType: 'ROLLBACK_DEPLOYMENT', riskScore: 35, riskLevel: 'LOW', status: 'PROPOSED' },
      { id: 'rem-2', actionType: 'RESTART_SERVICE', riskScore: 50, riskLevel: 'MEDIUM', status: 'PROPOSED' },
    ],
  };

  const mockChangeCorrelations: ChangeCorrelationResult[] = [
    {
      changeId: 'chg-001',
      changeType: 'DEPLOYMENT',
      changeDescription: 'Deployment v2.4.0-bad',
      affectedService: 'Payments Service',
      occurredAt: '2026-08-17T09:54:00Z',
      minutesBeforeDetection: 6,
      correlationScore: 92,
      correlationStrength: 'HIGH',
      scoreBreakdown: {
        temporalProximity: { score: 30, maxScore: 30, reason: 'High proximity' },
        serviceMatch: { score: 35, maxScore: 35, reason: 'Direct service match' },
        telemetryDegradation: { score: 20, maxScore: 20, reason: 'Metric anomaly' },
        rcaAlignment: { score: 15, maxScore: 15, reason: 'P1 alignment' },
      },
      supportingEvidence: ['Deployment occurred 6m before detection'],
      caveats: ['Correlation only'],
    },
  ];

  const mockEvidenceList = [
    { name: 'CPU Utilization', value: '92%', status: 'CRITICAL', baseline: '42%' },
    { name: 'P95 Latency', value: '1.8s', status: 'ELEVATED', change: '+240%' },
  ];

  const rcaResult = buildRcaInvestigation(mockIncident, mockChangeCorrelations, mockEvidenceList);

  it('decomposes overall incident risk score deterministically into 5 factors', () => {
    const result = buildIncidentDecisionSupport(mockIncident, rcaResult, mockChangeCorrelations, mockEvidenceList, ['Checkout API']);

    expect(result.incidentId).toBe('DELIBERATE-BREAKAGE-FAILED'); // DELIBERATE BREAKAGE — CI failure proof, will be reverted
    expect(result.riskAssessment.overallRiskScore).toBeGreaterThanOrEqual(60);
    expect(result.riskAssessment.factors.severity.score).toBe(30); // P1
    expect(result.riskAssessment.factors.changeCorrelation.score).toBe(23); // 92% of 25
    expect(result.riskAssessment.factors.telemetryDegradation.score).toBe(15);
  });

  it('compares remediation options side-by-side and selects top recommended decision', () => {
    const result = buildIncidentDecisionSupport(mockIncident, rcaResult, mockChangeCorrelations, mockEvidenceList);

    expect(result.remediationOptions.length).toBeGreaterThanOrEqual(3);
    expect(result.remediationOptions[0]!.isRecommended).toBe(true);
    expect(result.remediationOptions[0]!.actionType).toBe('ROLLBACK_DEPLOYMENT');
    expect(result.alternativeRejections.length).toBeGreaterThan(0);
    expect(result.alternativeRejections[0]!.reason).toContain('Lower RCA alignment');
  });

  it('generates What Would Change My Mind weaken and strengthen signals', () => {
    const result = buildIncidentDecisionSupport(mockIncident, rcaResult, mockChangeCorrelations, mockEvidenceList);

    expect(result.whatWouldChangeMyMind.weakenAssessmentSignals.length).toBeGreaterThan(0);
    expect(result.whatWouldChangeMyMind.strengthenAssessmentSignals.length).toBeGreaterThan(0);
    expect(result.whatWouldChangeMyMind.weakenAssessmentSignals[0]).toContain('Deployment timestamp');
  });

  it('enforces mandatory human approval requirement in execution safety assessment', () => {
    const result = buildIncidentDecisionSupport(mockIncident, rcaResult, mockChangeCorrelations, mockEvidenceList);

    expect(result.executionSafetyAssessment.isSafeToExecuteAutomatically).toBe(false);
    expect(result.executionSafetyAssessment.approvalRequirement).toBe('MANDATORY_HUMAN_APPROVAL');
    expect(result.recommendedDecision.approvalRequired).toBe(true);
  });
});
