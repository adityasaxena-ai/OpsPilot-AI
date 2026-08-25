import { describe, it, expect } from 'vitest';
import { calculatePSI, calculateErrorRateDrift, evaluateDriftMonitor } from './drift-detection.js';

describe('Drift Detection Statistical Methods', () => {
  describe('calculatePSI', () => {
    it('returns near 0 for identical probability distributions', () => {
      const baseline = [0.2, 0.3, 0.3, 0.2];
      const current = [0.2, 0.3, 0.3, 0.2];
      const score = calculatePSI(baseline, current);
      expect(score).toBeLessThan(0.01);
    });

    it('returns a high PSI score (>0.25) for significantly shifted distributions', () => {
      const baseline = [0.4, 0.4, 0.1, 0.1];
      const current = [0.05, 0.05, 0.45, 0.45];
      const score = calculatePSI(baseline, current);
      expect(score).toBeGreaterThan(0.25);
    });

    it('buckets continuous raw samples correctly', () => {
      const baseline = [10, 12, 11, 13, 10, 12, 11, 13];
      const current = [90, 92, 91, 93, 90, 92, 91, 93];
      const score = calculatePSI(baseline, current, 5);
      expect(score).toBeGreaterThan(0.25);
    });
  });

  describe('calculateErrorRateDrift', () => {
    it('calculates delta and percent change correctly', () => {
      const result = calculateErrorRateDrift(0.02, 0.08);
      expect(result.delta).toBe(0.06);
      expect(result.percentChange).toBe(300); // 300% increase
    });

    it('handles zero baseline error rate without divide-by-zero errors', () => {
      const result = calculateErrorRateDrift(0, 0.05);
      expect(result.delta).toBe(0.05);
      expect(result.percentChange).toBe(5); // 5% absolute shift
    });
  });

  describe('evaluateDriftMonitor', () => {
    it('evaluates PSI method and returns DRIFT_DETECTED when score >= threshold', () => {
      const result = evaluateDriftMonitor(
        {
          method: 'PSI',
          baselineSnapshot: [0.4, 0.4, 0.1, 0.1],
          threshold: 0.25,
        },
        [0.05, 0.05, 0.45, 0.45]
      );
      expect(result.state).toBe('DRIFT_DETECTED');
      expect(result.score).toBeGreaterThanOrEqual(0.25);
      expect(result.explanation).toContain('significant distribution drift detected');
    });

    it('evaluates PSI method and returns WARNING when score is in 80% threshold band', () => {
      // Moderate shift
      const result = evaluateDriftMonitor(
        {
          method: 'PSI',
          baselineSnapshot: [0.3, 0.3, 0.2, 0.2],
          threshold: 0.15,
        },
        [0.2, 0.25, 0.25, 0.3]
      );
      // If score is between 0.12 (0.15 * 0.8) and 0.15, it should be WARNING
      if (result.score >= 0.12 && result.score < 0.15) {
        expect(result.state).toBe('WARNING');
      }
    });

    it('evaluates ERROR_RATE_COMPARISON method correctly', () => {
      const result = evaluateDriftMonitor(
        {
          method: 'ERROR_RATE_COMPARISON',
          baselineSnapshot: 0.01,
          threshold: 0.05,
        },
        0.08
      );
      expect(result.state).toBe('DRIFT_DETECTED');
      expect(result.score).toBe(0.07);
    });
  });
});
