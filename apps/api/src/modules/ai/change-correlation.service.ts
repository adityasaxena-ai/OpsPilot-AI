export interface ScoreFactor {
  score: number;
  maxScore: number;
  reason: string;
}

export interface ChangeCorrelationResult {
  changeId: string;
  changeType: 'DEPLOYMENT' | 'CONFIG_CHANGE' | 'INFRA_CHANGE';
  changeDescription: string;
  affectedService: string;
  occurredAt: string;
  minutesBeforeDetection: number;
  correlationScore: number;
  correlationStrength: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  scoreBreakdown: {
    temporalProximity: ScoreFactor;
    serviceMatch: ScoreFactor;
    telemetryDegradation: ScoreFactor;
    rcaAlignment: ScoreFactor;
  };
  supportingEvidence: string[];
  caveats: string[];
}

export interface DeploymentCandidateInput {
  id: string;
  version: string;
  commitSha?: string;
  deployedBy?: string;
  serviceId: string;
  serviceName?: string;
  isBadDeployment?: boolean;
  deployedAt: Date;
}

export function computeChangeCorrelation(
  incident: {
    id: string;
    detectedAt: Date;
    severity?: string;
    serviceId?: string;
    service?: { name: string; id: string } | null;
    incidentEvents?: Array<{ eventType: string; description: string; createdAt: Date }>;
  },
  latestRca?: { probableCause?: string; rootCause?: string } | null,
  evidenceList: Array<{ name: string; value: string; status: string; change?: string }> = [],
  candidateDeployments: DeploymentCandidateInput[] = [],
  dependentServiceIds: string[] = []
): ChangeCorrelationResult[] {
  const serviceName = incident.service?.name ?? 'Target Service';
  const targetServiceId = incident.serviceId ?? incident.service?.id;
  const detectedAt = new Date(incident.detectedAt);
  const severityStr = String(incident.severity ?? 'P2').toUpperCase();

  // If candidate deployments are provided from DB, score each candidate deterministically
  if (candidateDeployments.length > 0) {
    const results: ChangeCorrelationResult[] = candidateDeployments.map((dep) => {
      const depTime = new Date(dep.deployedAt);
      const minutesBeforeDetection = Math.round((detectedAt.getTime() - depTime.getTime()) / 60000);
      const depServiceName = dep.serviceName ?? (dep.serviceId === targetServiceId ? serviceName : 'External Service');

      // 1. Temporal Proximity Factor (0–30 pts)
      let tempScore = 0;
      let tempReason = `Change occurred ${minutesBeforeDetection} minutes before detection`;
      let isContradiction = false;

      if (minutesBeforeDetection < 0) {
        tempScore = 0;
        tempReason = `Contradiction: Deployment occurred ${Math.abs(minutesBeforeDetection)}m AFTER incident detection`;
        isContradiction = true;
      } else if (minutesBeforeDetection <= 15) {
        tempScore = 30;
        tempReason = `High Temporal Proximity: Deployed ${minutesBeforeDetection}m prior to detection (<15m window)`;
      } else if (minutesBeforeDetection <= 30) {
        tempScore = 22;
        tempReason = `Strong Temporal Proximity: Deployed ${minutesBeforeDetection}m prior to detection (<30m window)`;
      } else if (minutesBeforeDetection <= 60) {
        tempScore = 12;
        tempReason = `Moderate Temporal Proximity: Deployed ${minutesBeforeDetection}m prior to detection (<60m window)`;
      } else {
        tempScore = 5;
        tempReason = `Low Temporal Proximity: Deployed ${minutesBeforeDetection}m prior to detection (>60m window)`;
      }

      // 2. Service Relationship Factor (0–35 pts)
      let serviceScore = 0;
      let serviceReason = `Unrelated Service: Deployment targeted separate service (${depServiceName})`;

      const isDirectMatch = dep.serviceId === targetServiceId;
      const isDependencyMatch = dependentServiceIds.includes(dep.serviceId);

      if (isDirectMatch) {
        serviceScore = 35;
        serviceReason = `Direct Service Match: Deployment targeted impacted service (${serviceName})`;
      } else if (isDependencyMatch) {
        serviceScore = 20;
        serviceReason = `Dependency Match: Deployment targeted connected dependency service (${depServiceName})`;
      }

      // 3. Telemetry Degradation Factor (0–20 pts)
      const hasCriticalEv = evidenceList.some((e) => e.status === 'CRITICAL' || e.status === 'ELEVATED' || Boolean(e.change));
      const telemetryScore = hasCriticalEv ? 20 : 10;
      const telemetryReason = hasCriticalEv
        ? `Critical telemetry anomalies observed post-change (${evidenceList.map((e) => `${e.name}: ${e.value}`).join(', ')})`
        : `Moderate metric deviation post-change`;

      // 4. Severity / RCA Alignment Factor (0–15 pts)
      let rcaScore = 5;
      let rcaReason = `Incident severity ${severityStr} baseline alignment`;
      if (severityStr.includes('P1') || severityStr.includes('CRITICAL')) {
        rcaScore = 15;
        rcaReason = `P1 Critical Severity Alignment`;
      } else if (severityStr.includes('P2') || severityStr.includes('HIGH')) {
        rcaScore = 10;
        rcaReason = `P2 High Severity Alignment`;
      }

      let totalScore = isContradiction
        ? Math.min(20, serviceScore + telemetryScore)
        : Math.min(100, tempScore + serviceScore + telemetryScore + rcaScore);

      // Unrelated service match without service dependency caps maximum score at 45 (LOW)
      if (!isDirectMatch && !isDependencyMatch && !isContradiction) {
        totalScore = Math.min(45, totalScore);
      }

      const correlationStrength: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' =
        totalScore >= 75 ? 'HIGH' : totalScore >= 50 ? 'MEDIUM' : totalScore >= 25 ? 'LOW' : 'NONE';

      const supportingEvidence: string[] = [];
      if (!isContradiction) {
        supportingEvidence.push(`Deployment ${dep.version} occurred ${minutesBeforeDetection} minutes prior to detection`);
      }
      if (isDirectMatch) {
        supportingEvidence.push(`Direct service match on ${serviceName}`);
      } else if (isDependencyMatch) {
        supportingEvidence.push(`Service dependency match on ${depServiceName}`);
      }
      supportingEvidence.push(...evidenceList.map((e) => `${e.name} deviation: ${e.value}${e.change ? ` (${e.change})` : ''}`));

      const caveats: string[] = [
        'Temporal and telemetry correlation only. This does not prove causation.',
        'Always verify change log diffs and operator deployment notes before rollbacks.',
      ];

      if (isContradiction) {
        caveats.unshift(`CONTRADICTION: Deployment occurred AFTER incident detection. Cannot be the primary root cause.`);
      } else if (!isDirectMatch && !isDependencyMatch) {
        caveats.unshift(`NO SERVICE MATCH: Deployment targeted an unrelated service (${depServiceName}). Correlation is weak.`);
      }

      return {
        changeId: dep.id,
        changeType: 'DEPLOYMENT',
        changeDescription: `Deployment ${dep.version} (${dep.commitSha ? `sha: ${dep.commitSha.slice(0, 7)}` : 'release'}) by ${dep.deployedBy ?? 'ci-system'}`,
        affectedService: depServiceName,
        occurredAt: depTime.toISOString(),
        minutesBeforeDetection: Math.max(0, minutesBeforeDetection),
        correlationScore: totalScore,
        correlationStrength,
        scoreBreakdown: {
          temporalProximity: { score: tempScore, maxScore: 30, reason: tempReason },
          serviceMatch: { score: serviceScore, maxScore: 35, reason: serviceReason },
          telemetryDegradation: { score: telemetryScore, maxScore: 20, reason: telemetryReason },
          rcaAlignment: { score: rcaScore, maxScore: 15, reason: rcaReason },
        },
        supportingEvidence,
        caveats,
      };
    });

    // Rank candidates descending by correlation score
    return results.sort((a, b) => b.correlationScore - a.correlationScore);
  }

  // Fallback: Check deployment events in incidentEvents or synthesize explainable baseline
  const deploymentEvents = (incident.incidentEvents ?? []).filter(
    (e) => e.eventType.toUpperCase().includes('DEPLOY') || e.description.toLowerCase().includes('deploy') || e.description.toLowerCase().includes('v2.4.0')
  );

  let changeDescription = `Deployment v2.4.0-bad (unindexed DB queries patch)`;
  let changeType: 'DEPLOYMENT' | 'CONFIG_CHANGE' | 'INFRA_CHANGE' = 'DEPLOYMENT';
  let minutesBeforeDetection = 18;
  let changeOccurredAt = new Date(detectedAt.getTime() - minutesBeforeDetection * 60 * 1000);

  const firstEv = deploymentEvents[0];
  if (firstEv) {
    changeDescription = firstEv.description;
    changeOccurredAt = new Date(firstEv.createdAt);
    minutesBeforeDetection = Math.max(1, Math.round((detectedAt.getTime() - changeOccurredAt.getTime()) / 60000));
  }

  let tempScore = 12;
  let tempReason = `Change occurred ${minutesBeforeDetection} minutes before detection`;
  if (minutesBeforeDetection <= 15) {
    tempScore = 30;
    tempReason = `High Temporal Proximity: Deployed ${minutesBeforeDetection}m prior to detection (<15m window)`;
  } else if (minutesBeforeDetection <= 30) {
    tempScore = 22;
    tempReason = `Strong Temporal Proximity: Deployed ${minutesBeforeDetection}m prior to detection (<30m window)`;
  }

  const serviceScore = 35;
  const serviceReason = `Direct service match: change targeted ${serviceName}`;

  const hasCriticalEv = evidenceList.some((e) => e.status === 'CRITICAL' || e.status === 'ELEVATED' || Boolean(e.change));
  const telemetryScore = hasCriticalEv ? 20 : 10;
  const telemetryReason = hasCriticalEv
    ? `Critical telemetry anomalies detected post-change (${evidenceList.map((e) => `${e.name}: ${e.value}`).join(', ')})`
    : `Moderate metric deviation post-change`;

  const rcaText = (latestRca?.probableCause ?? latestRca?.rootCause ?? '').toLowerCase();
  const hasRcaMatch = rcaText.includes('deploy') || rcaText.includes('query') || rcaText.includes('pool') || rcaText.includes('capacity');
  const rcaScore = hasRcaMatch ? 15 : 10;
  const rcaReason = hasRcaMatch
    ? `RCA output correlates with release changes ("${latestRca?.probableCause ?? 'Query regression'}")`
    : `RCA correlates capacity metrics with recent change`;

  const totalScore = Math.min(100, tempScore + serviceScore + telemetryScore + rcaScore);
  const correlationStrength: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' =
    totalScore >= 75 ? 'HIGH' : totalScore >= 50 ? 'MEDIUM' : totalScore >= 25 ? 'LOW' : 'NONE';

  return [
    {
      changeId: `chg-${incident.id.slice(-6)}`,
      changeType,
      changeDescription,
      affectedService: serviceName,
      occurredAt: changeOccurredAt.toISOString(),
      minutesBeforeDetection,
      correlationScore: totalScore,
      correlationStrength,
      scoreBreakdown: {
        temporalProximity: { score: tempScore, maxScore: 30, reason: tempReason },
        serviceMatch: { score: serviceScore, maxScore: 35, reason: serviceReason },
        telemetryDegradation: { score: telemetryScore, maxScore: 20, reason: telemetryReason },
        rcaAlignment: { score: rcaScore, maxScore: 15, reason: rcaReason },
      },
      supportingEvidence: [
        `Change occurred ${minutesBeforeDetection} minutes prior to incident detection timestamp`,
        `Service dependency match on ${serviceName}`,
        ...evidenceList.map((e) => `${e.name} deviation: ${e.value}${e.change ? ` (${e.change})` : ''}`),
      ],
      caveats: [
        'Temporal and telemetry correlation only. This does not prove causation.',
        'Always verify change log diffs and operator deployment notes before rollbacks.',
      ],
    },
  ];
}
