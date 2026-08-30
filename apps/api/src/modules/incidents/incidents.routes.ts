import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../lib/db.js';
import type { IncidentStatus, Severity } from '@opspilot/types';
import { requirePermission } from '../auth/auth.middleware.js';

export const incidentsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/incidents
  app.get<{
    Querystring: {
      status?: string;
      severity?: string;
      serviceId?: string;
      limit?: string;
      offset?: string;
    };
  }>('/', async (request) => {
    const { status, severity, serviceId, limit = '20', offset = '0' } = request.query;

    const where = {
      ...(status ? { status: status as IncidentStatus } : {}),
      ...(severity ? { severity: severity as Severity } : {}),
      ...(serviceId ? { serviceId } : {}),
    };

    const [incidents, total] = await Promise.all([
      db.incident.findMany({
        where,
        include: {
          service: { select: { id: true, name: true, slug: true, tier: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
          _count: { select: { alertGroups: true, evidence: true, remediations: true } },
        },
        orderBy: { detectedAt: 'desc' },
        take: Math.min(parseInt(limit, 10), 100),
        skip: parseInt(offset, 10),
      }),
      db.incident.count({ where }),
    ]);

    return {
      success: true,
      data: incidents,
      meta: { total, limit: parseInt(limit, 10), offset: parseInt(offset, 10) },
    };
  });

  // GET /api/v1/incidents/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const incident = await db.incident.findUnique({
      where: { id: request.params['id'] },
      include: {
        service: true,
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
        alertGroups: {
          include: {
            members: {
              include: {
                alert: { include: { service: { select: { id: true, name: true } } } },
              },
            },
          },
        },
        evidence: { orderBy: { relevanceScore: 'desc' } },
        investigations: { orderBy: { createdAt: 'desc' } },
        rcaResults: { orderBy: { createdAt: 'desc' }, take: 1 },
        remediations: { orderBy: { createdAt: 'desc' } },
        approvals: { orderBy: { createdAt: 'desc' } },
        incidentEvents: { orderBy: { createdAt: 'desc' } },
        postmortem: true,
      },
    });

    if (!incident) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Incident not found' },
      });
    }

    return { success: true, data: incident };
  });

  // GET /api/v1/incidents/:id/timeline
  app.get<{ Params: { id: string } }>('/:id/timeline', async (request, reply) => {
    const exists = await db.incident.findUnique({
      where: { id: request.params['id'] },
      select: { id: true },
    });

    if (!exists) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Incident not found' } });
    }

    const events = await db.incidentEvent.findMany({
      where: { incidentId: request.params['id'] },
      orderBy: { createdAt: 'asc' },
    });

    return { success: true, data: events };
  });

  // PATCH /api/v1/incidents/:id (requires authentication)
  app.patch<{
    Params: { id: string };
    Body: { status?: IncidentStatus; severity?: Severity; assignedToId?: string };
  }>('/:id', { preHandler: requirePermission('INCIDENT_VIEW') }, async (request, reply) => {
    const { status, severity, assignedToId } = request.body;

    const incident = await db.incident.findUnique({
      where: { id: request.params['id'] },
      select: { id: true, status: true },
    });

    if (!incident) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Incident not found' } });
    }

    const updated = await db.incident.update({
      where: { id: request.params['id'] },
      data: {
        ...(status ? { status } : {}),
        ...(severity ? { severity } : {}),
        ...(assignedToId ? { assignedToId } : {}),
        ...(status === 'TRIAGED' && !incident.status ? { triagedAt: new Date() } : {}),
        ...(status === 'RESOLVED' ? { resolvedAt: new Date() } : {}),
      },
    });

    return { success: true, data: updated };
  });

  // PATCH /api/v1/incidents/:id/status — Lifecycle State Machine Transition (requires REMEDIATION_APPROVE)
  app.patch<{
    Params: { id: string };
    Body: { status: string };
  }>('/:id/status', { preHandler: requirePermission('REMEDIATION_APPROVE') }, async (request, reply) => {
    const { id } = request.params;
    const { status: targetStatus } = request.body ?? {};

    const incident = await db.incident.findUnique({ where: { id } });
    if (!incident) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Incident not found' } });
    }

    const { LifecycleManager } = await import('@opspilot/detection');
    const lifecycle = new LifecycleManager();

    const result = lifecycle.validateTransition({
      currentStatus: incident.status as never,
      targetStatus: targetStatus as never,
      detectedAt: incident.detectedAt,
      triagedAt: incident.triagedAt,
      resolvedAt: incident.resolvedAt,
    });

    if (!result.allowed) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_STATE_TRANSITION', message: result.reason },
      });
    }

    const now = new Date();
    const updated = await db.incident.update({
      where: { id },
      data: {
        status: targetStatus as never,
        ...(targetStatus === 'ACKNOWLEDGED' || targetStatus === 'INVESTIGATING' ? { triagedAt: incident.triagedAt ?? now } : {}),
        ...(targetStatus === 'RESOLVED' || targetStatus === 'CLOSED' ? { resolvedAt: incident.resolvedAt ?? now } : {}),
        ...(result.mttdSeconds ? { mttdSeconds: result.mttdSeconds } : {}),
        ...(result.mttaSeconds ? { mttaSeconds: result.mttaSeconds } : {}),
        ...(result.mttrSeconds ? { mttrSeconds: result.mttrSeconds } : {}),
      },
      include: { service: true },
    });

    // Create incident timeline event for status transition
    await db.incidentEvent.create({
      data: {
        incidentId: id,
        eventType: 'STATUS_CHANGED',
        actorType: 'USER',
        description: `Incident status transitioned from ${incident.status} to ${targetStatus}`,
        metadata: {
          previousStatus: incident.status,
          newStatus: targetStatus,
          mttdSeconds: result.mttdSeconds,
          mttaSeconds: result.mttaSeconds,
          mttrSeconds: result.mttrSeconds,
        },
      },
    });

    return { success: true, data: updated };
  });

  // GET /api/v1/incidents/:id/topology — Service Dependency Blast Radius & Impact Analysis
  app.get<{ Params: { id: string } }>('/:id/topology', async (request, reply) => {
    const { id } = request.params;
    const incident = await db.incident.findUnique({
      where: { id },
      include: { service: true },
    });

    if (!incident) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Incident not found' } });
    }

    const services = await db.service.findMany({
      include: { dependsOn: true, dependedOnBy: true },
    });

    const nodeMap = new Map<string, import('@opspilot/detection').TopologyNode>();
    services.forEach((s) => {
      nodeMap.set(s.id, {
        id: s.id,
        name: s.name,
        slug: s.slug,
        tier: s.tier,
        healthScore: s.healthScore,
        dependsOnServiceIds: s.dependsOn.map((d) => d.dependsOnId),
        dependedOnByServiceIds: s.dependedOnBy.map((d) => d.serviceId),
      });
    });

    const { ImpactAnalyzer } = await import('@opspilot/detection');
    const analyzer = new ImpactAnalyzer();
    const impact = analyzer.analyzeImpact(incident.serviceId, nodeMap);

    return {
      success: true,
      data: {
        incidentId: id,
        targetService: incident.service,
        impact,
      },
    };
  });

  // GET /api/v1/incidents/:id/evidence
  app.get<{ Params: { id: string } }>('/:id/evidence', async (request, reply) => {
    const evidence = await db.evidence.findMany({
      where: { incidentId: request.params['id'] },
      orderBy: { relevanceScore: 'desc' },
    });

    if (!evidence) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Incident not found' } });
    }

    return { success: true, data: evidence };
  });
};
