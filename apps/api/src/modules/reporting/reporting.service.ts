import type { PrismaClient } from '@prisma/client';

export interface OperationalReport {
  timeWindowDays: number;
  startDate: string;
  endDate: string;
  incidentCounts: {
    bySeverity: Record<string, number>;
    byStatus: Record<string, number>;
    totalInWindow: number;
  };
  meanTimeMetrics: {
    mttdSecondsAverage: number | null;
    mttaSecondsAverage: number | null;
    mttrSecondsAverage: number | null;
  };
  remediationOutcomes: {
    byStatus: Record<string, number>;
    totalInWindow: number;
  };
  activeDriftEvents: {
    byState: Record<string, number>;
    totalActive: number;
  };
  topAffectedServices: Array<{
    serviceId: string;
    serviceName: string;
    tier: string;
    environment: string;
    incidentCount: number;
  }>;
}

export interface GovernanceReport {
  assetInventory: {
    byAssetType: Record<string, number>;
    byLifecycleStage: Record<string, number>;
    totalAssets: number;
  };
  riskDistribution: {
    byRiskLevel: Record<string, number>;
  };
  pendingApprovalsCount: number;
  openAiIncidents: {
    byStatus: Record<string, number>;
    byIncidentType: Record<string, number>;
    totalOpen: number;
  };
  highRiskAssets: Array<{
    id: string;
    name: string;
    assetType: string;
    riskLevel: string;
    lifecycleStage: string;
    serviceId: string | null;
    serviceName: string | null;
  }>;
  recentGovernanceTransitions: Array<{
    id: string;
    action: string;
    targetId: string | null;
    actorSubject: string | null;
    createdAt: string;
    metadata: unknown;
  }>;
}

export interface ExecutiveReportRiskItem {
  id: string;
  category: 'GOVERNED_ASSET' | 'DRIFT_EVENT' | 'AI_INCIDENT';
  title: string;
  severityOrRiskLevel: string;
  rankScore: number;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ExecutiveReport {
  timeWindowDays: number;
  operationalPosture: {
    overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
    activeP1P2Incidents: number;
    activeDriftEvents: number;
    pendingGovernanceApprovals: number;
  };
  topRisks: ExecutiveReportRiskItem[];
  remediationEffectiveness: {
    timeWindowDays: number;
    successfulCount: number;
    failedCount: number;
    totalTerminalCount: number;
    successRatePercent: number;
  };
}

/**
 * 1. Operational Report Aggregation
 * Summarizes Sim 1.0 incidents, MTTR/MTTD averages, remediation statuses, and Sim 2.0 active drift events.
 */
export async function getOperationalReport(db: PrismaClient, days: number = 30): Promise<OperationalReport> {
  const windowDays = Math.max(1, days);
  const startDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const endDate = new Date();

  // Incident counts by severity & status within window
  const severityGroup = await db.incident.groupBy({
    by: ['severity'],
    where: { createdAt: { gte: startDate } },
    _count: { id: true },
  });

  const statusGroup = await db.incident.groupBy({
    by: ['status'],
    where: { createdAt: { gte: startDate } },
    _count: { id: true },
  });

  const bySeverity: Record<string, number> = {};
  let totalInWindow = 0;
  for (const item of severityGroup) {
    bySeverity[item.severity] = item._count.id;
    totalInWindow += item._count.id;
  }

  const byStatus: Record<string, number> = {};
  for (const item of statusGroup) {
    byStatus[item.status] = item._count.id;
  }

  // Mean time metrics averaged over window
  const meanTimeAggregate = await db.incident.aggregate({
    where: { createdAt: { gte: startDate } },
    _avg: {
      mttdSeconds: true,
      mttaSeconds: true,
      mttrSeconds: true,
    },
  });

  // Remediation outcomes in window
  const remediationGroup = await db.remediationAction.groupBy({
    by: ['status'],
    where: { createdAt: { gte: startDate } },
    _count: { id: true },
  });

  const remediationByStatus: Record<string, number> = {};
  let totalRemediationsInWindow = 0;
  for (const item of remediationGroup) {
    remediationByStatus[item.status] = item._count.id;
    totalRemediationsInWindow += item._count.id;
  }

  // Active drift events by state (non-RESOLVED/non-HEALTHY)
  const activeDriftGroup = await db.driftEvent.groupBy({
    by: ['state'],
    where: { state: { notIn: ['HEALTHY', 'RESOLVED'] } },
    _count: { id: true },
  });

  const activeDriftByState: Record<string, number> = {};
  let totalActiveDrift = 0;
  for (const item of activeDriftGroup) {
    activeDriftByState[item.state] = item._count.id;
    totalActiveDrift += item._count.id;
  }

  // Top affected services in window
  const serviceIncidentsGroup = await db.incident.groupBy({
    by: ['serviceId'],
    where: { createdAt: { gte: startDate } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 5,
  });

  const serviceIds = serviceIncidentsGroup.map((g) => g.serviceId);
  const services = await db.service.findMany({
    where: { id: { in: serviceIds } },
    select: { id: true, name: true, tier: true, environment: true },
  });
  const serviceMap = new Map(services.map((s) => [s.id, s]));

  const topAffectedServices = serviceIncidentsGroup.map((g) => {
    const s = serviceMap.get(g.serviceId);
    return {
      serviceId: g.serviceId,
      serviceName: s?.name ?? 'Unknown Service',
      tier: s?.tier ?? 'UNKNOWN',
      environment: s?.environment ?? 'production',
      incidentCount: g._count.id,
    };
  });

  return {
    timeWindowDays: windowDays,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    incidentCounts: {
      bySeverity,
      byStatus,
      totalInWindow,
    },
    meanTimeMetrics: {
      mttdSecondsAverage: meanTimeAggregate._avg.mttdSeconds !== null ? Math.round(meanTimeAggregate._avg.mttdSeconds) : null,
      mttaSecondsAverage: meanTimeAggregate._avg.mttaSeconds !== null ? Math.round(meanTimeAggregate._avg.mttaSeconds) : null,
      mttrSecondsAverage: meanTimeAggregate._avg.mttrSeconds !== null ? Math.round(meanTimeAggregate._avg.mttrSeconds) : null,
    },
    remediationOutcomes: {
      byStatus: remediationByStatus,
      totalInWindow: totalRemediationsInWindow,
    },
    activeDriftEvents: {
      byState: activeDriftByState,
      totalActive: totalActiveDrift,
    },
    topAffectedServices,
  };
}

/**
 * 2. Governance Report Aggregation
 * Summarizes Sim 2.0 GovernedAssets, Risk Distributions, Pending Approvals, Open AI Incidents, and recent Audit Transitions.
 */
export async function getGovernanceReport(db: PrismaClient): Promise<GovernanceReport> {
  // Asset inventory counts by type and lifecycle stage
  const assetTypeGroup = await db.governedAsset.groupBy({
    by: ['assetType'],
    _count: { id: true },
  });

  const lifecycleStageGroup = await db.governedAsset.groupBy({
    by: ['lifecycleStage'],
    _count: { id: true },
  });

  const byAssetType: Record<string, number> = {};
  let totalAssets = 0;
  for (const item of assetTypeGroup) {
    byAssetType[item.assetType] = item._count.id;
    totalAssets += item._count.id;
  }

  const byLifecycleStage: Record<string, number> = {};
  for (const item of lifecycleStageGroup) {
    byLifecycleStage[item.lifecycleStage] = item._count.id;
  }

  // Risk distribution
  const riskGroup = await db.governedAsset.groupBy({
    by: ['riskLevel'],
    _count: { id: true },
  });

  const byRiskLevel: Record<string, number> = {};
  for (const item of riskGroup) {
    byRiskLevel[item.riskLevel] = item._count.id;
  }

  // Pending governance approvals count
  const pendingApprovalsCount = await db.governanceApproval.count({
    where: { status: 'PENDING' },
  });

  // Open AI incidents by status and type
  const openIncidentStatusGroup = await db.aiIncident.groupBy({
    by: ['status'],
    where: { status: { not: 'CLOSED' } },
    _count: { id: true },
  });

  const openIncidentTypeGroup = await db.aiIncident.groupBy({
    by: ['incidentType'],
    where: { status: { not: 'CLOSED' } },
    _count: { id: true },
  });

  const openByStatus: Record<string, number> = {};
  let totalOpen = 0;
  for (const item of openIncidentStatusGroup) {
    openByStatus[item.status] = item._count.id;
    totalOpen += item._count.id;
  }

  const openByType: Record<string, number> = {};
  for (const item of openIncidentTypeGroup) {
    openByType[item.incidentType] = item._count.id;
  }

  // High-risk assets with linked service information
  const highRiskAssetsRaw = await db.governedAsset.findMany({
    where: { riskLevel: { in: ['CRITICAL', 'HIGH'] } },
    include: { service: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const highRiskAssets = highRiskAssetsRaw.map((asset) => ({
    id: asset.id,
    name: asset.name,
    assetType: asset.assetType,
    riskLevel: asset.riskLevel,
    lifecycleStage: asset.lifecycleStage,
    serviceId: asset.serviceId ?? null,
    serviceName: asset.service?.name ?? null,
  }));

  // Recent governance lifecycle transitions from AuditLog
  const recentAuditLogs = await db.auditLog.findMany({
    where: { targetType: 'governed_asset' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      action: true,
      targetId: true,
      metadata: true,
      createdAt: true,
    },
  });

  const recentGovernanceTransitions = recentAuditLogs.map((log) => {
    const meta = (log.metadata ?? {}) as Record<string, unknown>;
    return {
      id: log.id,
      action: log.action,
      targetId: log.targetId,
      actorSubject: (meta.actorSubject as string) ?? null,
      createdAt: log.createdAt.toISOString(),
      metadata: log.metadata,
    };
  });

  return {
    assetInventory: {
      byAssetType,
      byLifecycleStage,
      totalAssets,
    },
    riskDistribution: {
      byRiskLevel,
    },
    pendingApprovalsCount,
    openAiIncidents: {
      byStatus: openByStatus,
      byIncidentType: openByType,
      totalOpen,
    },
    highRiskAssets,
    recentGovernanceTransitions,
  };
}

/**
 * 3. Executive Report Rollup
 * High-level rollup calling getOperationalReport and getGovernanceReport directly.
 * "Reports Never Disagree" principle: uses identical aggregated sub-objects.
 */
export async function getExecutiveReport(db: PrismaClient, days: number = 30): Promise<ExecutiveReport> {
  const windowDays = Math.max(1, days);
  const startDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  // Call underlying reports to ensure numbers match 100%
  const [operationalReport, governanceReport] = await Promise.all([
    getOperationalReport(db, windowDays),
    getGovernanceReport(db),
  ]);

  // Query active P1/P2 incidents
  const activeP1P2Incidents = await db.incident.count({
    where: {
      severity: { in: ['P1', 'P2'] },
      status: { notIn: ['RESOLVED', 'CLOSED'] },
    },
  });

  const activeDriftCount = operationalReport.activeDriftEvents.totalActive;
  const pendingApprovalsCount = governanceReport.pendingApprovalsCount;

  // Determine overall operational posture status
  let overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';
  if (activeP1P2Incidents > 0 || (operationalReport.activeDriftEvents.byState['ESCALATED'] ?? 0) > 0) {
    overallStatus = 'CRITICAL';
  } else if (activeDriftCount > 0 || pendingApprovalsCount > 0) {
    overallStatus = 'DEGRADED';
  }

  /**
   * Top 3-5 Risks Merged & Ranked List Logic:
   * Heuristic Rank Scores:
   * - GovernedAsset: CRITICAL = 100, HIGH = 75
   * - DriftEvent: ESCALATED = 85, DRIFT_DETECTED = 70, WARNING = 50
   * - AiIncident: P1 = 100, P2 = 80, P3 = 60
   */
  const candidateRisks: ExecutiveReportRiskItem[] = [];

  // 1. High/Critical GovernedAssets
  const highRiskAssets = await db.governedAsset.findMany({
    where: { riskLevel: { in: ['CRITICAL', 'HIGH'] } },
    include: { service: { select: { id: true, name: true } } },
    take: 5,
    orderBy: { createdAt: 'desc' },
  });

  for (const asset of highRiskAssets) {
    const score = asset.riskLevel === 'CRITICAL' ? 100 : 75;
    candidateRisks.push({
      id: asset.id,
      category: 'GOVERNED_ASSET',
      title: `High Risk Asset: ${asset.name}`,
      severityOrRiskLevel: asset.riskLevel,
      rankScore: score,
      details: {
        assetType: asset.assetType,
        ownerTeam: asset.ownerTeam,
        lifecycleStage: asset.lifecycleStage,
        serviceId: asset.serviceId ?? null,
        serviceName: asset.service?.name ?? null,
      },
      createdAt: asset.createdAt.toISOString(),
    });
  }

  // 2. Active/Escalated Drift Events
  const escalatedDriftEvents = await db.driftEvent.findMany({
    where: { state: { in: ['ESCALATED', 'DRIFT_DETECTED', 'WARNING'] } },
    include: {
      asset: {
        select: {
          name: true,
          serviceId: true,
          service: { select: { id: true, name: true } },
        },
      },
    },
    take: 5,
    orderBy: { createdAt: 'desc' },
  });

  for (const drift of escalatedDriftEvents) {
    let score = 50;
    if (drift.state === 'ESCALATED') score = 85;
    else if (drift.state === 'DRIFT_DETECTED') score = 70;

    candidateRisks.push({
      id: drift.id,
      category: 'DRIFT_EVENT',
      title: `Drift Alert: ${drift.metricName} on ${drift.asset.name}`,
      severityOrRiskLevel: drift.state,
      rankScore: score,
      details: {
        computedScore: drift.computedScore,
        threshold: drift.threshold,
        state: drift.state,
        serviceId: drift.asset.serviceId ?? null,
        serviceName: drift.asset.service?.name ?? null,
      },
      createdAt: drift.createdAt.toISOString(),
    });
  }

  // 3. Open P1/P2/P3 AI Incidents
  const openAiIncidents = await db.aiIncident.findMany({
    where: {
      status: { not: 'CLOSED' },
      severity: { in: ['P1', 'P2', 'P3'] },
    },
    take: 5,
    orderBy: { createdAt: 'desc' },
  });

  for (const aiInc of openAiIncidents) {
    let score = 60;
    if (aiInc.severity === 'P1') score = 100;
    else if (aiInc.severity === 'P2') score = 80;

    candidateRisks.push({
      id: aiInc.id,
      category: 'AI_INCIDENT',
      title: `AI Incident (${aiInc.incidentType}): ${aiInc.title}`,
      severityOrRiskLevel: aiInc.severity,
      rankScore: score,
      details: {
        incidentType: aiInc.incidentType,
        status: aiInc.status,
      },
      createdAt: aiInc.createdAt.toISOString(),
    });
  }

  // Sort candidate risks descending by rankScore, then by createdAt DESC
  candidateRisks.sort((a, b) => {
    if (b.rankScore !== a.rankScore) {
      return b.rankScore - a.rankScore;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const topRisks = candidateRisks.slice(0, 5);

  // Remediation effectiveness over window
  const terminalRemediations = await db.remediationAction.findMany({
    where: {
      createdAt: { gte: startDate },
      status: { in: ['SUCCEEDED', 'FAILED', 'ROLLED_BACK'] },
    },
    select: { status: true },
  });

  let successfulCount = 0;
  let failedCount = 0;
  for (const r of terminalRemediations) {
    if (r.status === 'SUCCEEDED') successfulCount++;
    else failedCount++;
  }

  const totalTerminalCount = terminalRemediations.length;
  const successRatePercent = totalTerminalCount > 0 ? Number(((successfulCount / totalTerminalCount) * 100).toFixed(1)) : 100.0;

  return {
    timeWindowDays: windowDays,
    operationalPosture: {
      overallStatus,
      activeP1P2Incidents,
      activeDriftEvents: activeDriftCount,
      pendingGovernanceApprovals: pendingApprovalsCount,
    },
    topRisks,
    remediationEffectiveness: {
      timeWindowDays: windowDays,
      successfulCount,
      failedCount,
      totalTerminalCount,
      successRatePercent,
    },
  };
}
