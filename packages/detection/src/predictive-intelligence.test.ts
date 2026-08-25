import { describe, expect, it } from 'vitest';
import {
  calculateLinearTrend,
  calculatePredictionConfidence,
  evaluatePredictionMonitor,
  projectValue,
} from './predictive-intelligence.js';

describe('Predictive Intelligence Engine (Unit Tests)', () => {
  const now = 1700000000000;

  describe('calculateLinearTrend', () => {
    it('calculates a perfect linear rising trend (rSquared = 1.0)', () => {
      // 10 samples, CPU rising by 5% every 1 minute (60,000 ms)
      const samples = Array.from({ length: 10 }, (_, i) => ({
        timestamp: now + i * 60000,
        value: 20 + i * 5, // 20, 25, 30, ... 65
      }));

      const trend = calculateLinearTrend(samples);
      expect(trend.rSquared).toBeCloseTo(1.0, 4);
      expect(trend.slope).toBeGreaterThan(0);
      // Slope per minute should be exactly 5
      expect(trend.slope * 60000).toBeCloseTo(5.0, 4);
    });

    it('calculates a flat trend with zero slope', () => {
      const samples = Array.from({ length: 10 }, (_, i) => ({
        timestamp: now + i * 60000,
        value: 50,
      }));

      const trend = calculateLinearTrend(samples);
      expect(trend.slope).toBe(0);
      expect(trend.intercept).toBe(50);
      expect(trend.rSquared).toBe(1.0); // Flat line has zero error
    });

    it('handles noisy data with lower rSquared', () => {
      const samples = [
        { timestamp: now, value: 20 },
        { timestamp: now + 60000, value: 40 },
        { timestamp: now + 120000, value: 15 },
        { timestamp: now + 180000, value: 50 },
        { timestamp: now + 240000, value: 30 },
      ];

      const trend = calculateLinearTrend(samples);
      expect(trend.rSquared).toBeLessThan(0.8);
      expect(trend.rSquared).toBeGreaterThan(0);
    });
  });

  describe('projectValue', () => {
    it('projects future values correctly along the trend line', () => {
      const trend = { slope: 0.1, intercept: 10, rSquared: 1.0 };
      // 10 minutes later = 600 seconds
      expect(projectValue(trend, 100)).toBe(20);
    });
  });

  describe('calculatePredictionConfidence', () => {
    it('returns 0 when sampleCount is less than minimumSamples', () => {
      expect(calculatePredictionConfidence(1.0, 4, 5)).toBe(0);
      expect(calculatePredictionConfidence(0.95, 3, 5)).toBe(0);
    });

    it('scales confidence between 50% and 100% of rSquared as sampleCount grows from min to 2x min', () => {
      // min = 5, 2x min = 10
      // 5 samples (min): multiplier = 5/10 = 0.5
      expect(calculatePredictionConfidence(1.0, 5, 5)).toBe(0.5);

      // 8 samples: multiplier = 8/10 = 0.8
      expect(calculatePredictionConfidence(1.0, 8, 5)).toBe(0.8);

      // 10 samples (2x min): multiplier = 1.0
      expect(calculatePredictionConfidence(1.0, 10, 5)).toBe(1.0);

      // 15 samples (>2x min): multiplier clamped at 1.0
      expect(calculatePredictionConfidence(0.9, 15, 5)).toBe(0.9);
    });
  });

  describe('evaluatePredictionMonitor', () => {
    const monitor = {
      metricName: 'cpuPercent',
      threshold: 85,
      horizonMinutes: 30,
      minimumSamples: 5,
    };

    it('returns INSUFFICIENT_EVIDENCE when sample count is less than minimumSamples', () => {
      const samples = [
        { timestamp: now, value: 30 },
        { timestamp: now + 60000, value: 35 },
        { timestamp: now + 120000, value: 40 },
      ];

      const result = evaluatePredictionMonitor(monitor, samples);
      expect(result.status).toBe('INSUFFICIENT_EVIDENCE');
      expect(result.projectedValue).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.trendSlope).toBeNull();
      expect(result.explanation).toContain('Insufficient evidence: received 3 sample(s), minimum required is 5');
    });

    it('generates an ACTIVE prediction with non-null projectedValue and explicit confidence and horizon in explanation text', () => {
      // 10 samples rising by 5% every minute from 30% to 75%
      const samples = Array.from({ length: 10 }, (_, i) => ({
        timestamp: now + i * 60000,
        value: 30 + i * 5,
      }));

      const result = evaluatePredictionMonitor(monitor, samples);
      expect(result.status).toBe('ACTIVE');
      expect(result.projectedValue).toBeDefined();
      expect(result.projectedValue).toBeGreaterThan(85); // 75 + 30*5 = 225
      expect(result.confidence).toBe(1.0);
      expect(result.trendSlope).toBeCloseTo(5.0, 2);

      // Core Safety Non-Hallucination Assertion: explanation must state confidence % and horizon explicitly!
      expect(result.explanation).toContain('100% confidence');
      expect(result.explanation).toContain('30 minutes');
      expect(result.explanation).toContain('cpuPercent');
      expect(result.explanation).toContain('exceeding threshold 85');
    });

    it('evaluates ACTIVE prediction when trend is below threshold (negative or flat slope)', () => {
      const samples = Array.from({ length: 6 }, (_, i) => ({
        timestamp: now + i * 60000,
        value: 40 - i * 2, // Falling
      }));

      const result = evaluatePredictionMonitor(monitor, samples);
      expect(result.status).toBe('ACTIVE');
      expect(result.projectedValue).toBeLessThan(40);
      expect(result.explanation).toContain('remaining below threshold 85');
      expect(result.explanation).toContain('30 minutes');
    });
  });
});
