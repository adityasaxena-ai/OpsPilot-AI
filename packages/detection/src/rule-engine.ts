import { ServiceTelemetry } from '@opspilot/telemetry';

export interface ThresholdRuleDefinition {
  id: string;
  name: string;
  metric: string; // cpuPercent, memoryPercent, errorRatePercent, latencyP99Ms, dbConnectionsActive, queueDepth
  operator: 'GT' | 'GTE' | 'LT' | 'LTE' | 'EQ';
  threshold: number;
  durationSec: number;
  severity: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  serviceId?: string | null;
  isEnabled: boolean;
}

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  serviceName: string;
  serviceId: string;
  metric: string;
  currentValue: number;
  threshold: number;
  operator: string;
  severity: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  isBreached: boolean;
  breachReason?: string;
  evaluatedAt: string;
}

export class RuleEngine {
  evaluateRules(
    rules: ThresholdRuleDefinition[],
    telemetryMap: Record<string, ServiceTelemetry>
  ): RuleEvaluationResult[] {
    const results: RuleEvaluationResult[] = [];
    const now = new Date().toISOString();

    for (const rule of rules) {
      if (!rule.isEnabled) continue;

      for (const [serviceName, telemetry] of Object.entries(telemetryMap)) {
        // If rule is target-scoped to specific service, match slug or ID
        if (rule.serviceId && rule.serviceId !== telemetry.serviceId && rule.serviceId !== serviceName) {
          continue;
        }

        const value = this.extractMetricValue(telemetry, rule.metric);
        if (value === undefined) continue;

        const isBreached = this.compareValues(value, rule.operator, rule.threshold);
        if (isBreached) {
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            serviceName,
            serviceId: telemetry.serviceId,
            metric: rule.metric,
            currentValue: value,
            threshold: rule.threshold,
            operator: rule.operator,
            severity: rule.severity,
            isBreached: true,
            breachReason: `Metric ${rule.metric} value ${value} breached threshold ${rule.operator} ${rule.threshold}`,
            evaluatedAt: now,
          });
        }
      }
    }

    return results;
  }

  private extractMetricValue(telemetry: ServiceTelemetry, metric: string): number | undefined {
    switch (metric) {
      case 'cpuPercent':
        return telemetry.cpuPercent;
      case 'memoryPercent':
        return telemetry.memoryPercent;
      case 'errorRatePercent':
        return telemetry.errorRatePercent;
      case 'latencyP50Ms':
        return telemetry.latencyP50Ms;
      case 'latencyP95Ms':
        return telemetry.latencyP95Ms;
      case 'latencyP99Ms':
        return telemetry.latencyP99Ms;
      case 'throughputRps':
        return telemetry.throughputRps;
      case 'dbConnectionsActive':
        return telemetry.dbConnectionsActive;
      case 'queueDepth':
        return telemetry.queueDepth;
      default:
        return undefined;
    }
  }

  private compareValues(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case 'GT':
        return value > threshold;
      case 'GTE':
        return value >= threshold;
      case 'LT':
        return value < threshold;
      case 'LTE':
        return value <= threshold;
      case 'EQ':
        return Math.abs(value - threshold) < 0.001;
      default:
        return false;
    }
  }
}
