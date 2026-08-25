import type { DriftMethod, DriftState } from '@prisma/client';

/**
 * Population Stability Index (PSI) calculation for distribution drift detection.
 *
 * Standard Interpretation Thresholds:
 * - PSI < 0.1: No significant distribution shift (Healthy)
 * - 0.1 <= PSI < 0.25: Moderate distribution shift (Warning)
 * - PSI >= 0.25: Significant distribution shift (Drift Detected)
 *
 * Note: These standard thresholds guide default configuration, but actual flag triggers
 * remain user-configurable per DriftMonitor instance.
 *
 * @param baseline Array of numbers representing baseline sample values or pre-bucketed probabilities.
 * @param current Array of numbers representing current observed sample values or pre-bucketed probabilities.
 * @param buckets Number of bins for bucketing continuous samples (default: 10).
 */
export function calculatePSI(baseline: number[], current: number[], buckets = 10): number {
  if (!baseline || baseline.length === 0 || !current || current.length === 0) {
    return 0;
  }

  const EPSILON = 0.0001;

  // Check if inputs are pre-bucketed probabilities (same length and sum close to 1.0)
  const baselineSum = baseline.reduce((acc, val) => acc + val, 0);
  const currentSum = current.reduce((acc, val) => acc + val, 0);
  const isPreBucketed =
    baseline.length === current.length &&
    Math.abs(baselineSum - 1.0) < 0.05 &&
    Math.abs(currentSum - 1.0) < 0.05;

  let expectedPct: number[];
  let actualPct: number[];

  if (isPreBucketed) {
    expectedPct = baseline.map((v) => Math.max(v, EPSILON));
    actualPct = current.map((v) => Math.max(v, EPSILON));
  } else {
    // Bucket raw sample values
    const combined = [...baseline, ...current];
    let min = Math.min(...combined);
    let max = Math.max(...combined);

    if (min === max) {
      min -= 0.001;
      max += 0.001;
    }

    const bucketWidth = (max - min) / buckets;

    const expectedCounts = new Array<number>(buckets).fill(0);
    const actualCounts = new Array<number>(buckets).fill(0);

    for (const val of baseline) {
      let idx = Math.floor((val - min) / bucketWidth);
      if (idx >= buckets) idx = buckets - 1;
      if (idx < 0) idx = 0;
      expectedCounts[idx]!++;
    }

    for (const val of current) {
      let idx = Math.floor((val - min) / bucketWidth);
      if (idx >= buckets) idx = buckets - 1;
      if (idx < 0) idx = 0;
      actualCounts[idx]!++;
    }

    expectedPct = expectedCounts.map((c) => Math.max(c / baseline.length, EPSILON));
    actualPct = actualCounts.map((c) => Math.max(c / current.length, EPSILON));
  }

  // Re-normalize percentages
  const sumE = expectedPct.reduce((acc, v) => acc + v, 0);
  const sumA = actualPct.reduce((acc, v) => acc + v, 0);
  expectedPct = expectedPct.map((v) => v / sumE);
  actualPct = actualPct.map((v) => v / sumA);

  let psi = 0;
  for (let i = 0; i < expectedPct.length; i++) {
    const e = expectedPct[i]!;
    const a = actualPct[i]!;
    psi += (a - e) * Math.log(a / e);
  }

  return Number(psi.toFixed(4));
}

/**
 * Calculates drift between a baseline error rate and a current error rate.
 *
 * @param baselineErrorRate Baseline error rate (e.g. 0.02 for 2%).
 * @param currentErrorRate Current observed error rate (e.g. 0.08 for 8%).
 * @param minSampleSize Optional minimum sample size required for calculation.
 */
export function calculateErrorRateDrift(
  baselineErrorRate: number,
  currentErrorRate: number,
  minSampleSize?: number
): { delta: number; percentChange: number } {
  const delta = Number((currentErrorRate - baselineErrorRate).toFixed(4));

  let percentChange: number;
  if (baselineErrorRate === 0) {
    // Edge case: baseline error rate is 0.
    // If current error rate is also 0, percent change is 0%.
    // If current error rate > 0, percent change represents full relative shift (current * 100).
    percentChange = currentErrorRate === 0 ? 0 : Number((currentErrorRate * 100).toFixed(2));
  } else {
    percentChange = Number((((currentErrorRate - baselineErrorRate) / baselineErrorRate) * 100).toFixed(2));
  }

  return { delta, percentChange };
}

export interface DriftMonitorInput {
  method: DriftMethod;
  baselineSnapshot: unknown;
  threshold: number;
}

/**
 * Evaluates an observed value against a DriftMonitor configuration.
 *
 * Approaching Threshold Heuristic:
 * We define "approaching threshold" (WARNING state) as when computed score reaches 80% of the threshold.
 * - Score >= threshold: DRIFT_DETECTED
 * - Score >= threshold * 0.8: WARNING
 * - Score < threshold * 0.8: HEALTHY
 * This 80% band is an adjustable heuristic to give early visibility before full drift triggering.
 */
export function evaluateDriftMonitor(
  monitor: DriftMonitorInput,
  observedValue: unknown
): { score: number; state: DriftState; explanation: string } {
  const { method, baselineSnapshot, threshold } = monitor;

  let score = 0;
  let explanation = '';

  if (method === 'PSI') {
    const baselineArr = parseNumberArray(baselineSnapshot);
    const observedArr = parseNumberArray(observedValue);

    score = calculatePSI(baselineArr, observedArr);

    if (score >= threshold) {
      explanation = `PSI score of ${score} exceeds threshold ${threshold} (significant distribution drift detected)`;
    } else if (score >= threshold * 0.8) {
      explanation = `PSI score of ${score} is approaching threshold ${threshold} (warning band >= ${threshold * 0.8})`;
    } else {
      explanation = `PSI score of ${score} is within healthy limits (< ${threshold * 0.8})`;
    }
  } else if (method === 'ERROR_RATE_COMPARISON') {
    const baselineRate = parseNumberValue(baselineSnapshot);
    const currentRate = parseNumberValue(observedValue);

    const { delta, percentChange } = calculateErrorRateDrift(baselineRate, currentRate);
    score = Math.abs(delta);

    if (score >= threshold) {
      explanation = `Error rate shift of ${delta > 0 ? '+' : ''}${delta} (${percentChange}% change from baseline ${baselineRate}) exceeds threshold ${threshold}`;
    } else if (score >= threshold * 0.8) {
      explanation = `Error rate shift of ${delta > 0 ? '+' : ''}${delta} (${percentChange}% change from baseline ${baselineRate}) is approaching threshold ${threshold}`;
    } else {
      explanation = `Error rate shift of ${delta > 0 ? '+' : ''}${delta} (${percentChange}% change from baseline ${baselineRate}) is within healthy limits`;
    }
  }

  let state: DriftState = 'HEALTHY';
  if (score >= threshold) {
    state = 'DRIFT_DETECTED';
  } else if (score >= threshold * 0.8) {
    state = 'WARNING';
  }

  return { score, state, explanation };
}

function parseNumberArray(val: unknown): number[] {
  if (Array.isArray(val)) {
    return val.map((v) => Number(v)).filter((v) => !isNaN(v));
  }
  if (typeof val === 'object' && val !== null && 'values' in val && Array.isArray((val as any).values)) {
    return (val as any).values.map((v: unknown) => Number(v)).filter((v: number) => !isNaN(v));
  }
  return [];
}

function parseNumberValue(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  if (typeof val === 'object' && val !== null && 'errorRate' in val) {
    return Number((val as any).errorRate) || 0;
  }
  return 0;
}
