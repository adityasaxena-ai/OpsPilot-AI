import type { PrismaClient, VerificationVerdict } from '@prisma/client';
import { RemediationExecutor } from '@opspilot/remediation';

export interface SuccessCriteria {
  metric: 'errorRatePercent' | 'latencyP99Ms' | 'cpuPercent' | 'isHealthy';
  maxAcceptableValue?: number;
  expectedValue?: boolean;
}

export interface ProposeOptionItem {
  actionType: string;
  serviceId?: string;
  rationale?: string;
  successCriteria: SuccessCriteria;
}

export interface VerificationVerdictResult {
  verdict: VerificationVerdict;
  notes: string;
  currentMetrics: Record<string, unknown>;
}

/**
 * Evaluates verification verdict comparing successCriteria against current metrics.
 * 
 * Rules:
 * - VERIFIED_SUCCESS: criteria clearly met
 * - VERIFIED_FAILURE: criteria clearly violated
 * - INCONCLUSIVE: missing data, missing simState, or unrecognized metric key
 * Silence or ambiguity MUST resolve to INCONCLUSIVE, never success.
 */
export function evaluateVerificationVerdict(
  criteria: SuccessCriteria | null | undefined,
  simState: { errorRatePercent: number; latencyP99Ms: number; cpuPercent: number; isHealthy: boolean } | null | undefined
): VerificationVerdictResult {
  if (!simState) {
    return {
      verdict: 'INCONCLUSIVE',
      notes: 'No active SimService telemetry state found at verification time.',
      currentMetrics: {},
    };
  }

  const currentMetrics = {
    errorRatePercent: simState.errorRatePercent,
    latencyP99Ms: simState.latencyP99Ms,
    cpuPercent: simState.cpuPercent,
    isHealthy: simState.isHealthy,
  };

  if (!criteria || !criteria.metric) {
    return {
      verdict: 'INCONCLUSIVE',
      notes: 'No valid successCriteria metric specified on action.',
      currentMetrics,
    };
  }

  const metricKey = criteria.metric;

  if (metricKey === 'isHealthy') {
    const expected = criteria.expectedValue ?? true;
    const actual = simState.isHealthy;
    if (actual === expected) {
      return {
        verdict: 'VERIFIED_SUCCESS',
        notes: `Success criteria met: isHealthy is ${actual}.`,
        currentMetrics,
      };
    } else {
      return {
        verdict: 'VERIFIED_FAILURE',
        notes: `Success criteria violated: isHealthy is ${actual}, expected ${expected}.`,
        currentMetrics,
      };
    }
  }

  const maxVal = criteria.maxAcceptableValue;
  if (typeof maxVal !== 'number') {
    return {
      verdict: 'INCONCLUSIVE',
      notes: `Success criteria for metric '${metricKey}' missing numeric maxAcceptableValue.`,
      currentMetrics,
    };
  }

  let currentValue: number | undefined;
  if (metricKey === 'errorRatePercent') currentValue = simState.errorRatePercent;
  else if (metricKey === 'latencyP99Ms') currentValue = simState.latencyP99Ms;
  else if (metricKey === 'cpuPercent') currentValue = simState.cpuPercent;

  if (typeof currentValue !== 'number') {
    return {
      verdict: 'INCONCLUSIVE',
      notes: `Unrecognized or missing metric key '${metricKey}'.`,
      currentMetrics,
    };
  }

  if (currentValue <= maxVal) {
    return {
      verdict: 'VERIFIED_SUCCESS',
      notes: `Success criteria met: ${metricKey} (${currentValue.toFixed(2)}) <= maxAcceptable (${maxVal}).`,
      currentMetrics,
    };
  } else {
    return {
      verdict: 'VERIFIED_FAILURE',
      notes: `Success criteria violated: ${metricKey} (${currentValue.toFixed(2)}) > maxAcceptable (${maxVal}).`,
      currentMetrics,
    };
  }
}
