/**
 * Predictive Intelligence Engine (Sim 2.0 Operational Risk Detection)
 *
 * Provides defensible, explainable linear regression forecasting and confidence scoring
 * for service operational telemetry metrics (CPU, Memory, Latency, Queue Depth, etc.).
 *
 * CORE SAFETY PRINCIPLE:
 * A prediction must NEVER be stated as an absolute certainty ("this will happen").
 * Every prediction includes:
 * 1. An explicit confidence figure derived from goodness-of-fit (rSquared) and sample size sufficiency.
 * 2. An explicit time horizon (horizonMinutes).
 * 3. Transparent evidence samples and calculated trend slope.
 * 4. Automatic fallback to INSUFFICIENT_EVIDENCE when sample size is below minimum threshold.
 */

export interface MetricSample {
  timestamp: number; // Unix timestamp in milliseconds
  value: number;     // Metric value
}

export interface PredictionMonitorInput {
  id?: string;
  serviceId?: string;
  metricName: string;
  threshold: number;
  horizonMinutes: number;
  minimumSamples: number;
}

export interface LinearTrendResult {
  slope: number;     // Units per millisecond (or per minute when converted)
  intercept: number;
  rSquared: number;  // Coefficient of determination [0, 1]
}

export interface PredictionEvaluationResult {
  status: 'ACTIVE' | 'INSUFFICIENT_EVIDENCE' | 'EXPIRED';
  projectedValue: number | null;
  confidence: number;      // [0, 1]
  trendSlope: number | null; // Value change per minute for human readability
  explanation: string;
  rSquared?: number;
  sampleCount: number;
}

/**
 * Calculates standard least-squares linear regression over timestamped metric samples.
 *
 * Formula:
 *   slope (m) = ∑((x_i - x̄)(y_i - ȳ)) / ∑((x_i - x̄)²)
 *   intercept (c) = ȳ - m * x̄
 *   r² = [∑((x_i - x̄)(y_i - ȳ))]² / [∑((x_i - x̄)²) * ∑((y_i - ȳ)²)]
 */
export function calculateLinearTrend(samples: MetricSample[]): LinearTrendResult {
  if (samples.length < 2) {
    return { slope: 0, intercept: samples[0]?.value ?? 0, rSquared: 0 };
  }

  const n = samples.length;
  let sumX = 0;
  let sumY = 0;

  for (const s of samples) {
    sumX += s.timestamp;
    sumY += s.value;
  }

  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (const s of samples) {
    const dx = s.timestamp - meanX;
    const dy = s.value - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  if (denX === 0) {
    // All timestamps identical
    return { slope: 0, intercept: meanY, rSquared: 0 };
  }

  const slope = num / denX;
  const intercept = meanY - slope * meanX;

  let rSquared = 0;
  if (denY > 0) {
    rSquared = (num * num) / (denX * denY);
  } else {
    // Zero variance in y (perfect flat line)
    rSquared = 1.0;
  }

  // Bound rSquared between 0 and 1
  rSquared = Math.max(0, Math.min(1, rSquared));

  return { slope, intercept, rSquared };
}

/**
 * Projects the linear regression line forward to a target timestamp.
 */
export function projectValue(trend: { slope: number; intercept: number }, targetTimestamp: number): number {
  return trend.slope * targetTimestamp + trend.intercept;
}

/**
 * Calculates prediction confidence based on statistical fit quality and sample size.
 *
 * CONFIDENCE FORMULA & JUSTIFICATION:
 * Confidence must reflect both:
 * 1. Goodness-of-Fit (rSquared): How well the sample data fits a straight line [0 to 1].
 * 2. Sample Sufficiency Multiplier: Scaling factor = min(1.0, sampleCount / (minimumSamples * 2)).
 *
 * Rationale:
 * - A 3-point sample line with r² = 1.0 has limited sample size confidence.
 * - Requiring 2x minimumSamples for 100% sample sufficiency ensures confidence scales smoothly
 *   from 50% sufficiency at minimumSamples up to 100% sufficiency at 2 * minimumSamples.
 * - Final confidence = rSquared * min(1.0, sampleCount / (minimumSamples * 2)).
 */
export function calculatePredictionConfidence(
  rSquared: number,
  sampleCount: number,
  minimumSamples: number
): number {
  if (sampleCount < minimumSamples) {
    return 0;
  }

  const sufficiencyMultiplier = Math.min(1.0, sampleCount / (minimumSamples * 2));
  const rawConfidence = rSquared * sufficiencyMultiplier;

  // Round to 4 decimal places and bound [0, 1]
  return Math.max(0, Math.min(1, Math.round(rawConfidence * 10000) / 10000));
}

/**
 * Evaluates a PredictionMonitor against a set of time-series metric samples.
 */
export function evaluatePredictionMonitor(
  monitor: PredictionMonitorInput,
  samples: MetricSample[]
): PredictionEvaluationResult {
  const sorted = [...samples].sort((a, b) => a.timestamp - b.timestamp);
  const sampleCount = sorted.length;

  if (sampleCount < monitor.minimumSamples) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      projectedValue: null,
      confidence: 0,
      trendSlope: null,
      explanation: `Insufficient evidence: received ${sampleCount} sample(s), minimum required is ${monitor.minimumSamples} to generate a prediction over a ${monitor.horizonMinutes}-minute horizon.`,
      sampleCount,
    };
  }

  const trend = calculateLinearTrend(sorted);
  const latestTimestamp = sorted[sorted.length - 1]?.timestamp ?? Date.now();

  // Compute horizon timestamp in milliseconds
  const horizonMs = monitor.horizonMinutes * 60 * 1000;
  const targetTimestamp = latestTimestamp + horizonMs;

  const rawProjected = projectValue(trend, targetTimestamp);
  const projectedValue = Math.round(rawProjected * 100) / 100;

  const confidence = calculatePredictionConfidence(trend.rSquared, sampleCount, monitor.minimumSamples);
  const confidencePct = Math.round(confidence * 100);

  // Convert slope from per-millisecond to per-minute
  const slopePerMinute = Math.round(trend.slope * 60000 * 10000) / 10000;

  const trendDirection = slopePerMinute >= 0 ? 'rising' : 'falling';
  const thresholdComparison = projectedValue >= monitor.threshold ? 'exceeding' : 'remaining below';

  const explanation = `${confidencePct}% confidence ${monitor.metricName} will reach ${projectedValue} (${thresholdComparison} threshold ${monitor.threshold}) within ${monitor.horizonMinutes} minutes based on ${sampleCount} samples showing a ${trendDirection} trend (${slopePerMinute >= 0 ? '+' : ''}${slopePerMinute}/min).`;

  return {
    status: 'ACTIVE',
    projectedValue,
    confidence,
    trendSlope: slopePerMinute,
    explanation,
    rSquared: Math.round(trend.rSquared * 10000) / 10000,
    sampleCount,
  };
}
