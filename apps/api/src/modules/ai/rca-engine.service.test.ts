import { describe, it, expect } from 'vitest';
import { buildRcaInvestigation } from './rca-engine.service.js';
import type { ChangeCorrelationResult } from './change-correlation.service.js';

describe('RCA Investigation Engine', () => {
  const mockIncident = {
    id: 'inc-rca-001',
    detectedAt: new Date('2026-08-17T10:00:00Z'),
    severity: 'P1',
    status: 'INVESTIGATING',
    service: { id: 'srv-1', name: 'Payments Service', tier: 'T1' },
    rcaResults: [{ probableCause: 'Unindexed database query patch regression', confidence: 0.92 }],
  };

  const mockChangeCorrelations: ChangeCorrelationResult[] = [
    {
      changeId: 'chg-001',
      changeType: 'DEPLOYMENT',
      changeDescription: 'Deployment v2.4.0-bad',
      affectedService: 'Payments Service',
      occurredAt: '2026-08-17T09:54:00Z',
      minutesBeforeDetection: 6,
      correlationScore: 95,
      correlationStrength: 'HIGH',
      scoreBreakdown: {
        temporalProximity: { score: 30, maxScore: 30, reason: 'High proximity <15m' },
        serviceMatch: { score: 35, maxScore: 35, reason: 'Direct service match' },
        telemetryDegradation: { score: 20, maxScore: 20, reason: 'Critical metric anomaly' },
        rcaAlignment: { score: 15, maxScore: 15, reason: 'P1 alignment' },
      },
      supportingEvidence: ['Deployment occurred 6m before detection', 'Direct service match'],
      caveats: ['Correlation only. Causation not proven.'],
    },
  ];

  const mockEvidenceList = [
    { name: 'CPU Utilization', value: '92%', status: 'CRITICAL', baseline: '42%' },
    { name: 'P95 Latency', value: '1.8s', status: 'ELEVATED', change: '+240%' },
  ];

  it('ranks top hypothesis accurately based on change correlation and telemetry', () => {
    const result = buildRcaInvestigation(mockIncident, mockChangeCorrelations, mockEvidenceList);

    expect(result.incidentId).toBe('inc-rca-001');
    expect(result.hypothesesRanking.length).toBeGreaterThanOrEqual(3);
    expect(result.topHypothesis.rank).toBe(1);
    expect(result.topHypothesis.title).toContain('Deployment v2.4.0-bad');
    expect(result.topHypothesis.confidence).toBe('HIGH');
    expect(result.topHypothesis.confidenceScore).toBe(95);
  });

  it('classifies facts, correlated signals, inferred causes, and unknowns explicitly', () => {
    const result = buildRcaInvestigation(mockIncident, mockChangeCorrelations, mockEvidenceList);

    expect(result.observedFacts.some((f) => f.includes('Impacted Service: Payments Service'))).toBe(true);
    expect(result.observedFacts.some((f) => f.includes('CPU Utilization: 92%'))).toBe(true);
    expect(result.correlatedSignals.some((s) => s.includes('Deployment v2.4.0-bad'))).toBe(true);
    expect(result.inferredCauses.length).toBeGreaterThan(0);
    expect(result.unknowns.length).toBeGreaterThan(0);
  });

  it('provides read-only SRE next investigation steps', () => {
    const result = buildRcaInvestigation(mockIncident, mockChangeCorrelations, mockEvidenceList);

    expect(result.recommendedNextSteps.length).toBeGreaterThan(0);
    expect(result.recommendedNextSteps[0]).toContain('Compare release diffs');
    expect(result.limitationNotice).toContain('Causation is not proven');
  });

  it('handles missing change correlation data safely', () => {
    const result = buildRcaInvestigation(mockIncident, [], mockEvidenceList);

    expect(result.hypothesesRanking[0]!.title).toContain('Resource Contention');
    expect(result.correlatedSignals[0]).toContain('No recent release correlation identified');
  });
});
