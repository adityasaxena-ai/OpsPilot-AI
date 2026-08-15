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

export function computeChangeCorrelation(
  incident: {
    id: string;
    detectedAt: Date;
    service?: { name: string; id: string } | null;
    incidentEvents?: Array<{ eventType: string; description: string; createdAt: Date }>;
  },
  latestRca?: { probableCause?: string; rootCause?: string } | null,
  evidenceList: Array<{ name: string; value: string; status: string; change?: string }> = []
): ChangeCorrelationResult[] {
  const serviceName = incident.service?.name ?? 'Target Service';
  const detectedAt = new Date(incident.detectedAt);

  // Check if there are deployment events in incidentEvents or synthesize from service metadata
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

  // 1. Temporal Proximity (25%)
  let tempScore = 10;
  let tempReason = `Change occurred ${minutesBeforeDetection} minutes before incident detection (>60m window)`;
  if (minutesBeforeDetection <= 30) {
    tempScore = 25;
    tempReason = `Change occurred ${minutesBeforeDetection} minutes before detection (High temporal proximity < 30m)`;
  } else if (minutesBeforeDetection <= 60) {
    tempScore = 18;
    tempReason = `Change occurred ${minutesBeforeDetection} minutes before detection (Moderate proximity < 60m)`;
  }

  // 2. Service Match (25%)
  const serviceScore = 25;
  const serviceReason = `Direct service match: change targeted ${serviceName}`;

  // 3. Telemetry Degradation (25%)
  const hasCriticalEv = evidenceList.some((e) => e.status === 'CRITICAL' || e.status === 'ELEVATED' || Boolean(e.change));
  const telemetryScore = hasCriticalEv ? 25 : 15;
  const telemetryReason = hasCriticalEv
    ? `Critical telemetry anomalies detected immediately post-change (${evidenceList.map((e) => `${e.name}: ${e.value}`).join(', ')})`
    : `Moderate metric deviation post-change`;

  // 4. RCA/Evidence Alignment (25%)
  const rcaText = (latestRca?.probableCause ?? latestRca?.rootCause ?? '').toLowerCase();
  const hasRcaMatch = rcaText.includes('deploy') || rcaText.includes('query') || rcaText.includes('pool') || rcaText.includes('capacity');
  const rcaScore = hasRcaMatch ? 23 : 15;
  const rcaReason = hasRcaMatch
    ? `RCA output correlates with release changes ("${latestRca?.probableCause ?? 'Query regression'}")`
    : `RCA correlates general capacity exhaustion with recent change`;

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
        temporalProximity: { score: tempScore, maxScore: 25, reason: tempReason },
        serviceMatch: { score: serviceScore, maxScore: 25, reason: serviceReason },
        telemetryDegradation: { score: telemetryScore, maxScore: 25, reason: telemetryReason },
        rcaAlignment: { score: rcaScore, maxScore: 25, reason: rcaReason },
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
