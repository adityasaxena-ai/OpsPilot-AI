import { PrismaClient } from '@prisma/client';
import type { EvidenceItemInput } from './investigation-agent.js';

export class EvidenceCollector {
  constructor(private db: PrismaClient) {}

  async collectForIncident(incidentId: string): Promise<EvidenceItemInput[]> {
    const evidenceItems: EvidenceItemInput[] = [];

    // 1. Fetch Incident & Service
    const incident = await this.db.incident.findUnique({
      where: { id: incidentId },
      include: { service: { include: { simState: true } } },
    });

    if (!incident || !incident.service) return evidenceItems;

    const service = incident.service;
    const simState = service.simState;

    // 2. Metrics Evidence
    if (simState) {
      evidenceItems.push({
        type: 'METRIC',
        title: `Telemetry Metrics for ${service.name}`,
        content: `CPU: ${simState.cpuPercent.toFixed(1)}%, Memory: ${simState.memoryPercent.toFixed(1)}%, Error Rate: ${simState.errorRatePercent.toFixed(2)}%, Latency P99: ${Math.round(simState.latencyP99Ms)}ms, DB Connections: ${simState.dbConnectionsActive}/${simState.dbConnectionsMax}, Queue Depth: ${simState.queueDepth}`,
        relevanceScore: simState.isHealthy ? 0.6 : 0.95,
      });
    }

    // 3. Deployment Evidence (last 2 hours)
    const recentDeployments = await this.db.simDeployment.findMany({
      where: {
        serviceId: service.id,
        deployedAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      },
      orderBy: { deployedAt: 'desc' },
      take: 3,
    });

    for (const dep of recentDeployments) {
      evidenceItems.push({
        type: 'DEPLOYMENT',
        title: `Deployment ${dep.version} on ${service.name}`,
        content: `Version ${dep.version} deployed by ${dep.deployedBy} at ${dep.deployedAt.toISOString()}. Bad Deployment: ${dep.isBadDeployment}${dep.failureType ? ` (${dep.failureType})` : ''}`,
        relevanceScore: dep.isBadDeployment ? 0.98 : 0.7,
      });
    }

    // 4. Correlated Alert Evidence
    const alertGroups = await this.db.alertGroup.findMany({
      where: { incidentId },
      include: {
        members: { include: { alert: true } },
      },
    });

    const alertCount = alertGroups.flatMap((g) => g.members).length;
    if (alertCount > 0) {
      evidenceItems.push({
        type: 'LOG',
        title: `Correlated Alerts (${alertCount} active)`,
        content: alertGroups
          .flatMap((g) => g.members)
          .map((m) => `[${m.alert.severity}] ${m.alert.title} (x${m.alert.occurrenceCount}): ${m.alert.description}`)
          .join('\n'),
        relevanceScore: 0.9,
      });
    }

    // 5. Historical Incidents Evidence
    const pastIncidents = await this.db.incident.findMany({
      where: {
        serviceId: service.id,
        id: { not: incidentId },
        status: 'RESOLVED',
      },
      orderBy: { resolvedAt: 'desc' },
      take: 2,
    });

    for (const past of pastIncidents) {
      evidenceItems.push({
        type: 'HISTORICAL',
        title: `Past Incident: ${past.title}`,
        content: `Resolved past incident on ${service.name}. Severity: ${past.severity}, MTTR: ${past.mttrSeconds ?? 'N/A'}s`,
        relevanceScore: 0.65,
      });
    }

    // Persist evidence into evidence table for UI inspection
    for (const item of evidenceItems) {
      await this.db.evidence.create({
        data: {
          incidentId,
          evidenceType: item.type as never,
          source: 'evidence_collector',
          title: item.title,
          content: item.content,
          relevanceScore: item.relevanceScore,
          collectedAt: new Date(),
        },
      });
    }

    return evidenceItems;
  }
}
