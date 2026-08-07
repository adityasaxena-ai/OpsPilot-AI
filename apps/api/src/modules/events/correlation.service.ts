import type { Alert, CanonicalEvent } from '@opspilot/types';
import { db } from '../../lib/db.js';
import { redis } from '../../lib/redis.js';
import { sseEmitter } from '../../lib/sse.js';

const CORRELATION_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

interface CorrelationResult {
  incidentId: string;
  action: 'incident_created' | 'incident_updated';
}

interface CorrelationCandidate {
  incidentId: string;
  score: number;
  reason: string;
}

/**
 * Correlation scoring algorithm.
 * Returns the best matching open incident or creates a new one.
 */
export async function correlateEvent(
  alert: { id: string; serviceId: string; severity: string; fingerprint: string },
  event: CanonicalEvent,
): Promise<CorrelationResult> {
  const windowStart = new Date(Date.now() - CORRELATION_WINDOW_MS);

  // Find open incidents in the correlation window
  const openIncidents = await db.incident.findMany({
    where: {
      status: {
        notIn: ['RESOLVED', 'FAILED', 'ESCALATED'],
      },
      detectedAt: { gte: windowStart },
    },
    include: {
      service: {
        include: {
          dependsOn: true,
          dependedOnBy: true,
        },
      },
      alertGroups: {
        include: {
          members: { include: { alert: true } },
        },
      },
    },
  });

  // Get service dependencies for scoring
  const service = await db.service.findUnique({
    where: { id: event.serviceId },
    include: {
      dependsOn: true,
      dependedOnBy: true,
    },
  });

  // Get recent deployments for this service
  const recentDeployment = await db.simDeployment.findFirst({
    where: {
      serviceId: event.serviceId,
      deployedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
    orderBy: { deployedAt: 'desc' },
  });

  const candidates: CorrelationCandidate[] = [];

  for (const incident of openIncidents) {
    let score = 0;
    const reasons: string[] = [];

    // Same service → strong correlation
    if (incident.serviceId === event.serviceId) {
      score += 50;
      reasons.push('same_service');
    }

    // Dependency relationship
    const dependencyIds = [
      ...(service?.dependsOn.map((d) => d.dependsOnId) ?? []),
      ...(service?.dependedOnBy.map((d) => d.serviceId) ?? []),
    ];
    if (dependencyIds.includes(incident.serviceId)) {
      score += 30;
      reasons.push('dependency_relationship');
    }

    // Same environment
    if (incident.environment === event.environment) {
      score += 10;
      reasons.push('same_environment');
    }

    // Recent deployment on same service
    if (recentDeployment && incident.serviceId === event.serviceId) {
      score += 40;
      reasons.push('recent_deployment');
    }

    // Matching error signature (check existing alerts in the incident)
    const incidentAlertFingerprints = incident.alertGroups.flatMap((g) =>
      g.members.map((m) => m.alert.fingerprint),
    );
    const fingerprintPrefix = event.fingerprint.substring(0, 8);
    if (incidentAlertFingerprints.some((f) => f.startsWith(fingerprintPrefix))) {
      score += 25;
      reasons.push('matching_signature');
    }

    if (score >= 60) {
      candidates.push({ incidentId: incident.id, score, reason: reasons.join(', ') });
    }
  }

  // Pick highest-scoring candidate
  candidates.sort((a, b) => b.score - a.score);
  const bestCandidate = candidates[0];

  if (bestCandidate) {
    // Add alert to existing incident
    const group = await db.alertGroup.findFirst({
      where: { incidentId: bestCandidate.incidentId },
    });

    if (group) {
      await db.alertGroupMember.create({
        data: { alertGroupId: group.id, alertId: alert.id },
      });
    }

    // Record incident event
    await db.incidentEvent.create({
      data: {
        incidentId: bestCandidate.incidentId,
        eventType: 'ALERT_CORRELATED',
        actorType: 'SYSTEM',
        description: `Alert correlated to incident (score: ${bestCandidate.score}, reason: ${bestCandidate.reason})`,
        metadata: { alertId: alert.id, correlationScore: bestCandidate.score, reason: bestCandidate.reason },
      },
    });

    // Update incident status to CORRELATED if not already past that
    const incident = await db.incident.findUnique({
      where: { id: bestCandidate.incidentId },
      select: { status: true },
    });

    if (incident?.status === 'DETECTED') {
      await db.incident.update({
        where: { id: bestCandidate.incidentId },
        data: { status: 'CORRELATED' },
      });
    }

    sseEmitter.emit('incident_updated', { incidentId: bestCandidate.incidentId });

    return { incidentId: bestCandidate.incidentId, action: 'incident_updated' };
  }

  // No candidate → create new incident
  const newIncident = await db.incident.create({
    data: {
      title: buildIncidentTitle(event),
      description: `Automated incident from ${event.source}: ${event.eventType} on ${event.serviceId}`,
      severity: event.severity as never,
      status: 'DETECTED',
      serviceId: event.serviceId,
      environment: event.environment as never,
      detectedAt: new Date(event.timestamp),
    },
  });

  // Create alert group
  const alertGroup = await db.alertGroup.create({
    data: {
      incidentId: newIncident.id,
      correlationReason: 'initial_alert',
    },
  });

  await db.alertGroupMember.create({
    data: { alertGroupId: alertGroup.id, alertId: alert.id },
  });

  // Record timeline event
  await db.incidentEvent.create({
    data: {
      incidentId: newIncident.id,
      eventType: 'INCIDENT_CREATED',
      actorType: 'SYSTEM',
      description: `Incident auto-created from alert (${event.severity}) on ${event.serviceId}`,
      metadata: { alertId: alert.id, source: event.source, fingerprint: event.fingerprint },
    },
  });

  sseEmitter.emit('incident_created', { incidentId: newIncident.id });

  // Asynchronously trigger AI Agent pipeline (Triage -> Evidence -> Investigation -> RCA)
  setImmediate(async () => {
    try {
      const { AIOrchestrator } = await import('@opspilot/agents');
      const orchestrator = new AIOrchestrator(db);
      await orchestrator.runFullPipeline(newIncident.id);
    } catch (err) {
      console.error('[AI] Pipeline execution error:', err);
    }
  });

  return { incidentId: newIncident.id, action: 'incident_created' };
}

function buildIncidentTitle(event: CanonicalEvent): string {
  const payloadTitle = event.payload['title'] as string | undefined;
  if (payloadTitle) return payloadTitle;

  const typeLabel: Record<string, string> = {
    BAD_DEPLOYMENT: 'Bad Deployment Detected',
    HIGH_CPU: 'High CPU Usage',
    MEMORY_LEAK: 'Memory Leak Detected',
    DB_CONNECTION_EXHAUSTION: 'Database Connection Exhaustion',
    API_LATENCY: 'API Latency Degradation',
    QUEUE_BACKLOG: 'Message Queue Backlog',
    BATCH_FAILURE: 'Batch Job Failure',
    DISK_FULL: 'Disk Space Critical',
    DEPENDENCY_FAILURE: 'Dependency Service Failure',
    CERT_EXPIRY: 'Certificate Expiry Warning',
  };

  const scenario = event.labels['scenario'] ?? '';
  return typeLabel[scenario] ?? `${event.severity} Alert — ${event.serviceId}`;
}
