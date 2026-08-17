import { describe, it, expect } from 'vitest';
import { computeChangeCorrelation, type DeploymentCandidateInput } from './change-correlation.service.js';

describe('Change Correlation Intelligence Engine', () => {
  const baseIncident = {
    id: 'inc-test-001',
    detectedAt: new Date('2026-08-17T10:00:00Z'),
    severity: 'P1',
    serviceId: 'srv-payments',
    service: { id: 'srv-payments', name: 'Payments Service' },
  };

  // Scenario A — Strong correlation: Change immediately precedes incident + direct service match + telemetry degradation
  it('Scenario A: evaluates strong correlation for direct service deployment <15m before incident', () => {
    const candidate: DeploymentCandidateInput = {
      id: 'dep-a',
      version: 'v2.8.4-payments',
      serviceId: 'srv-payments',
      serviceName: 'Payments Service',
      deployedAt: new Date('2026-08-17T09:54:00Z'), // 6m before detection
      deployedBy: 'release-bot',
      commitSha: 'a91a0ed',
    };

    const evidenceList = [
      { name: 'P95 Latency', value: '1.8s', status: 'ELEVATED', change: '+240%' },
      { name: 'Error Rate', value: '7.2%', status: 'HIGH', change: '+5.4%' },
    ];

    const results = computeChangeCorrelation(baseIncident, { probableCause: 'Query regression' }, evidenceList, [candidate]);

    expect(results).toHaveLength(1);
    const res = results[0]!;
    expect(res.correlationStrength).toBe('HIGH');
    expect(res.correlationScore).toBeGreaterThanOrEqual(75);
    expect(res.scoreBreakdown.temporalProximity.score).toBe(30); // <15m window
    expect(res.scoreBreakdown.serviceMatch.score).toBe(35); // Direct service match
    expect(res.scoreBreakdown.telemetryDegradation.score).toBe(20); // Anomaly present
  });

  // Scenario B — Temporal only: Change occurs shortly before incident but affects unrelated service
  it('Scenario B: evaluates lower correlation for temporal proximity without service match', () => {
    const candidate: DeploymentCandidateInput = {
      id: 'dep-b',
      version: 'v1.2.0-analytics',
      serviceId: 'srv-unrelated',
      serviceName: 'Analytics Service',
      deployedAt: new Date('2026-08-17T09:48:00Z'), // 12m before detection
      deployedBy: 'data-team',
    };

    const results = computeChangeCorrelation(baseIncident, null, [], [candidate]);

    expect(results).toHaveLength(1);
    const res = results[0]!;
    expect(res.correlationStrength).toBe('LOW'); // Unrelated service caps score at 45 (LOW)
    expect(res.scoreBreakdown.serviceMatch.score).toBe(0);
    expect(res.caveats[0]).toContain('NO SERVICE MATCH');
  });

  // Scenario C — Incident before change: Deployment occurred AFTER incident detectedAt
  it('Scenario C: flags contradiction if deployment occurred AFTER incident detection', () => {
    const candidate: DeploymentCandidateInput = {
      id: 'dep-c',
      version: 'v2.8.5-fix',
      serviceId: 'srv-payments',
      serviceName: 'Payments Service',
      deployedAt: new Date('2026-08-17T10:10:00Z'), // 10m AFTER detection
      deployedBy: 'hotfix-bot',
    };

    const results = computeChangeCorrelation(baseIncident, null, [], [candidate]);

    expect(results).toHaveLength(1);
    const res = results[0]!;
    expect(res.scoreBreakdown.temporalProximity.score).toBe(0);
    expect(res.caveats[0]).toContain('CONTRADICTION: Deployment occurred AFTER incident detection');
  });

  // Scenario D — Competing changes: Ranks multiple deployment candidates by evidence strength
  it('Scenario D: ranks competing deployment candidates correctly', () => {
    const candidateDirect: DeploymentCandidateInput = {
      id: 'dep-direct',
      version: 'v2.8.4-payments',
      serviceId: 'srv-payments',
      serviceName: 'Payments Service',
      deployedAt: new Date('2026-08-17T09:50:00Z'), // 10m before
    };

    const candidateUnrelated: DeploymentCandidateInput = {
      id: 'dep-unrelated',
      version: 'v1.1.0-billing',
      serviceId: 'srv-unrelated',
      serviceName: 'Unrelated Service',
      deployedAt: new Date('2026-08-17T09:52:00Z'), // 8m before
    };

    const results = computeChangeCorrelation(baseIncident, null, [], [candidateUnrelated, candidateDirect]);

    expect(results).toHaveLength(2);
    // Highest scoring candidate must be first
    expect(results[0]!.changeId).toBe('dep-direct');
    expect(results[0]!.correlationScore).toBeGreaterThan(results[1]!.correlationScore);
  });

  // Scenario E — No relevant change: Returns low/none score when deployment is outside reasonable window
  it('Scenario E: scores low correlation when deployment is >60 minutes prior', () => {
    const candidateOld: DeploymentCandidateInput = {
      id: 'dep-old',
      version: 'v2.7.0-payments',
      serviceId: 'srv-payments',
      serviceName: 'Payments Service',
      deployedAt: new Date('2026-08-17T08:00:00Z'), // 120m before
    };

    const results = computeChangeCorrelation(baseIncident, null, [], [candidateOld]);

    expect(results).toHaveLength(1);
    const res = results[0]!;
    expect(res.scoreBreakdown.temporalProximity.score).toBe(5); // Low proximity
  });

  // Scenario F — Missing data: Handles empty deployments safely with baseline fallback
  it('Scenario F: handles missing deployment data safely with baseline fallback', () => {
    const results = computeChangeCorrelation(baseIncident, null, []);

    expect(results).toHaveLength(1);
    expect(results[0]!.affectedService).toBe('Payments Service');
    expect(results[0]!.caveats).toContain('Temporal and telemetry correlation only. This does not prove causation.');
  });
});
