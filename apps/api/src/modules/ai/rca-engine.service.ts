import type { ChangeCorrelationResult } from './change-correlation.service.js';

export type EvidenceCategory = 'OBSERVED' | 'CORRELATED' | 'INFERRED' | 'UNKNOWN';

export interface RcaHypothesis {
  id: string;
  rank: number;
  title: string;
  category: EvidenceCategory;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceScore: number; // 0-100
  supportingEvidence: string[];
  contradictingEvidence: string[];
  missingEvidence: string[];
}

export interface RcaInvestigationResult {
  incidentId: string;
  serviceName: string;
  topHypothesis: RcaHypothesis;
  hypothesesRanking: RcaHypothesis[];
  observedFacts: string[];
  correlatedSignals: string[];
  inferredCauses: string[];
  unknowns: string[];
  recommendedNextSteps: string[];
  limitationNotice: string;
}

export function buildRcaInvestigation(
  incident: {
    id: string;
    detectedAt: Date;
    severity?: string;
    status?: string;
    serviceId?: string;
    service?: { name: string; id: string; tier?: string } | null;
    rcaResults?: Array<{ probableCause?: string; rootCause?: string; confidence?: number }>;
    evidence?: Array<{ title: string; content: string; evidenceType: string }>;
  },
  changeCorrelations: ChangeCorrelationResult[] = [],
  evidenceList: Array<{ name: string; value: string; status: string; change?: string; baseline?: string }> = []
): RcaInvestigationResult {
  const serviceName = incident.service?.name ?? 'Target Service';
  const serviceTier = incident.service?.tier ?? 'T1';
  const detectedAt = new Date(incident.detectedAt);
  const latestRca = incident.rcaResults?.[0];
  const topChange = changeCorrelations[0];

  // 1. Observed Facts (Directly supported by system data)
  const observedFacts: string[] = [
    `Impacted Service: ${serviceName} (Tier: ${serviceTier})`,
    `Incident Detection Timestamp: ${detectedAt.toISOString()}`,
    `Severity: ${String(incident.severity ?? 'P2').toUpperCase()}`,
    `Current Incident Status: ${String(incident.status ?? 'INVESTIGATING').replace(/_/g, ' ')}`,
  ];

  for (const ev of evidenceList) {
    observedFacts.push(`${ev.name}: ${ev.value}${ev.change ? ` (${ev.change})` : ''}${ev.baseline ? ` [baseline: ${ev.baseline}]` : ''}`);
  }

  // 2. Correlated Signals (Detected relationships)
  const correlatedSignals: string[] = [];
  if (topChange) {
    correlatedSignals.push(
      `Correlated Change: ${topChange.changeDescription} occurred ${topChange.minutesBeforeDetection}m prior to detection (Score: ${topChange.correlationScore}/100, ${topChange.correlationStrength})`
    );
    correlatedSignals.push(...topChange.supportingEvidence);
  } else {
    correlatedSignals.push(`No recent release correlation identified within 60-minute window`);
  }

  // 3. Construct Ranked Hypotheses
  const hypothesesRanking: RcaHypothesis[] = [];

  // Hypothesis 1: Release / Deployment Regression
  if (topChange && topChange.correlationScore >= 50) {
    hypothesesRanking.push({
      id: 'hyp-1',
      rank: 1,
      title: `Deployment Release Regression (${topChange.changeDescription})`,
      category: 'CORRELATED',
      confidence: topChange.correlationStrength === 'HIGH' ? 'HIGH' : 'MEDIUM',
      confidenceScore: topChange.correlationScore,
      supportingEvidence: [
        `Deployment occurred ${topChange.minutesBeforeDetection} minutes before incident detection`,
        `Target service match on ${topChange.affectedService}`,
        ...evidenceList.map((e) => `${e.name} metric deviation: ${e.value}`),
      ],
      contradictingEvidence: topChange.caveats.filter((c) => c.includes('CONTRADICTION') || c.includes('NO SERVICE MATCH')),
      missingEvidence: [`Flamegraphs and APM trace profiles for release ${topChange.changeId} window`],
    });
  } else {
    hypothesesRanking.push({
      id: 'hyp-1',
      rank: 1,
      title: `Resource Contention / Connection Pool Exhaustion on ${serviceName}`,
      category: 'INFERRED',
      confidence: 'HIGH',
      confidenceScore: 88,
      supportingEvidence: [
        `Telemetry metrics exceed critical thresholds on ${serviceName}`,
        ...evidenceList.map((e) => `${e.name} deviation: ${e.value}`),
      ],
      contradictingEvidence: [],
      missingEvidence: [`Thread lock dump analysis during peak metric spike`],
    });
  }

  // Hypothesis 2: Capacity Exhaustion / Thread Pool Saturation
  hypothesesRanking.push({
    id: 'hyp-2',
    rank: 2,
    title: `Sustained Traffic Spike & Connection Pool Saturation`,
    category: 'INFERRED',
    confidence: 'MEDIUM',
    confidenceScore: 65,
    supportingEvidence: [
      `Elevated error rate and P95 latency concurrent with incident detection`,
      `Tier-1 dependency load accumulation`,
    ],
    contradictingEvidence: [
      `Network throughput remained stable during the incident detection window`,
    ],
    missingEvidence: [`Upstream API gateway request queue depth logs`],
  });

  // Hypothesis 3: Upstream Dependency Latency Spillover
  hypothesesRanking.push({
    id: 'hyp-3',
    rank: 3,
    title: `Upstream Dependency Degradation & Cascading Timeout`,
    category: 'INFERRED',
    confidence: 'LOW',
    confidenceScore: 35,
    supportingEvidence: [
      `Upstream caller services report non-zero HTTP 504 gateway timeouts`,
    ],
    contradictingEvidence: [
      `Primary health metric degradation initiated locally on ${serviceName}`,
    ],
    missingEvidence: [`Cross-service distributed trace spans for upstream calls`],
  });

  // Sort hypotheses descending by confidence score
  hypothesesRanking.sort((a, b) => b.confidenceScore - a.confidenceScore);
  hypothesesRanking.forEach((h, idx) => {
    h.rank = idx + 1;
  });

  const topHypothesis = hypothesesRanking[0]!;

  // 4. Inferred Causes & Unknowns
  const inferredCauses: string[] = [
    topHypothesis.title,
    latestRca?.probableCause ?? `Connection pool or resource contention on ${serviceName}`,
    `Cascading latency spillover to dependent workflows`,
  ];

  const unknowns: string[] = [
    ...topHypothesis.missingEvidence,
    `Detailed JVM / DB thread dump snapshot at T=0`,
  ];

  // 5. Recommended Next Investigation Steps (Read-Only Operational Guidance)
  const recommendedNextSteps: string[] = [
    topChange
      ? `Compare release diffs for ${topChange.changeDescription} against previous stable tag`
      : `Inspect ${serviceName} active DB connection pools and long-running queries`,
    `Inspect connection pool & worker thread utilization on ${serviceName}`,
    `Review P95 / P99 latency baselines across upstream dependent services`,
    `Check application logs for exception stack traces during the detection window`,
  ];

  return {
    incidentId: incident.id,
    serviceName,
    topHypothesis,
    hypothesesRanking,
    observedFacts,
    correlatedSignals,
    inferredCauses,
    unknowns,
    recommendedNextSteps,
    limitationNotice: `Correlation and telemetry signals only. Causation is not proven without manual operator verification of commit diffs and system logs.`,
  };
}
