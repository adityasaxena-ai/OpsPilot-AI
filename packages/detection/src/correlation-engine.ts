export interface AlertCandidate {
  id: string;
  serviceId: string;
  serviceName: string;
  severity: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  fingerprint: string;
  metric: string;
  environment: string;
  summary: string;
}

export interface IncidentCandidate {
  id: string;
  serviceId: string;
  severity: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  environment: string;
  detectedAt: Date;
  status: string;
  dependentServiceIds: string[];
}

export interface CorrelationEvaluation {
  alertId: string;
  matchedIncidentId?: string | undefined;
  score: number;
  reasons: string[];
  shouldCreateNewIncident: boolean;
}

export class CorrelationEngine {
  private readonly thresholdScore = 40;

  evaluateCorrelation(
    alert: AlertCandidate,
    openIncidents: IncidentCandidate[],
    hasRecentDeployment = false
  ): CorrelationEvaluation {
    let bestScore = 0;
    let bestIncidentId: string | undefined = undefined;
    let bestReasons: string[] = [];

    for (const incident of openIncidents) {
      let score = 0;
      const reasons: string[] = [];

      // 1. Same service (+50)
      if (incident.serviceId === alert.serviceId) {
        score += 50;
        reasons.push('Same Service (+50)');
      }

      // 2. Dependency relationship (+30)
      if (incident.dependentServiceIds.includes(alert.serviceId)) {
        score += 30;
        reasons.push('Topology Dependency (+30)');
      }

      // 3. Same environment (+10)
      if (incident.environment === alert.environment) {
        score += 10;
        reasons.push('Same Environment (+10)');
      }

      // 4. Recent deployment on service (+40)
      if (hasRecentDeployment && incident.serviceId === alert.serviceId) {
        score += 40;
        reasons.push('Recent Deployment Correlation (+40)');
      }

      if (score > bestScore) {
        bestScore = score;
        bestIncidentId = incident.id;
        bestReasons = reasons;
      }
    }

    const shouldCreateNew = bestScore < this.thresholdScore || !bestIncidentId;

    return {
      alertId: alert.id,
      matchedIncidentId: shouldCreateNew ? undefined : bestIncidentId,
      score: bestScore,
      reasons: bestReasons,
      shouldCreateNewIncident: shouldCreateNew,
    };
  }
}
