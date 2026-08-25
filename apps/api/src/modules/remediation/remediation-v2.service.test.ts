import { describe, it, expect } from 'vitest';
import { evaluateVerificationVerdict, type SuccessCriteria } from './remediation-v2.service.js';

describe('Remediation V2 Verdict Determination Unit Tests', () => {
  it('returns VERIFIED_SUCCESS when errorRatePercent is below maxAcceptableValue', () => {
    const criteria: SuccessCriteria = {
      metric: 'errorRatePercent',
      maxAcceptableValue: 1.0,
    };
    const simState = {
      cpuPercent: 45,
      errorRatePercent: 0.25,
      latencyP99Ms: 180,
      isHealthy: true,
    };

    const res = evaluateVerificationVerdict(criteria, simState);
    expect(res.verdict).toBe('VERIFIED_SUCCESS');
    expect(res.notes).toContain('Success criteria met');
    expect(res.currentMetrics.errorRatePercent).toBe(0.25);
  });

  it('returns VERIFIED_FAILURE when latencyP99Ms exceeds maxAcceptableValue', () => {
    const criteria: SuccessCriteria = {
      metric: 'latencyP99Ms',
      maxAcceptableValue: 500,
    };
    const simState = {
      cpuPercent: 60,
      errorRatePercent: 0.1,
      latencyP99Ms: 1250,
      isHealthy: false,
    };

    const res = evaluateVerificationVerdict(criteria, simState);
    expect(res.verdict).toBe('VERIFIED_FAILURE');
    expect(res.notes).toContain('Success criteria violated');
    expect(res.currentMetrics.latencyP99Ms).toBe(1250);
  });

  it('returns VERIFIED_SUCCESS for boolean isHealthy criteria', () => {
    const criteria: SuccessCriteria = {
      metric: 'isHealthy',
      expectedValue: true,
    };
    const simState = {
      cpuPercent: 30,
      errorRatePercent: 0.0,
      latencyP99Ms: 100,
      isHealthy: true,
    };

    const res = evaluateVerificationVerdict(criteria, simState);
    expect(res.verdict).toBe('VERIFIED_SUCCESS');
  });

  it('returns INCONCLUSIVE when simState is null or missing', () => {
    const criteria: SuccessCriteria = {
      metric: 'cpuPercent',
      maxAcceptableValue: 80,
    };

    const res = evaluateVerificationVerdict(criteria, null);
    expect(res.verdict).toBe('INCONCLUSIVE');
    expect(res.notes).toContain('No active SimService telemetry state found');
  });

  it('returns INCONCLUSIVE when criteria or metric key is missing or invalid', () => {
    const simState = {
      cpuPercent: 50,
      errorRatePercent: 0.1,
      latencyP99Ms: 200,
      isHealthy: true,
    };

    const res1 = evaluateVerificationVerdict(null, simState);
    expect(res1.verdict).toBe('INCONCLUSIVE');

    const res2 = evaluateVerificationVerdict({ metric: 'unknownMetric' as any }, simState);
    expect(res2.verdict).toBe('INCONCLUSIVE');
  });
});
