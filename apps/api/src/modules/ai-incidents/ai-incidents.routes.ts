import type { FastifyPluginAsync } from 'fastify';
import type { AiIncidentStatus, AiIncidentType, AiIncidentTimelineEntryType, Severity } from '@prisma/client';
import { db } from '../../lib/db.js';
import { requirePermission } from '../auth/auth.middleware.js';

async function getValidUserId(actorId: string | undefined): Promise<string | undefined> {
  if (!actorId) return undefined;
  const user = await db.user.findFirst({
    where: { OR: [{ id: actorId }, { email: actorId }] },
    select: { id: true },
  });
  return user ? user.id : undefined;
}

/**
 * State Transition Matrix for AI Incidents.
 *
 * Defines allowed status progressions to prevent invalid state jumps
 * while maintaining flexibility for incident response workflows.
 */
const ALLOWED_STATUS_TRANSITIONS: Record<AiIncidentStatus, AiIncidentStatus[]> = {
  DETECTED: ['TRIAGED', 'UNDER_INVESTIGATION', 'CLOSED'],
  TRIAGED: ['UNDER_INVESTIGATION', 'UNDER_REVIEW', 'REMEDIATION_PLANNED', 'CLOSED'],
  UNDER_INVESTIGATION: ['UNDER_REVIEW', 'REMEDIATION_PLANNED', 'RESOLVED', 'CLOSED'],
  UNDER_REVIEW: ['REMEDIATION_PLANNED', 'REMEDIATION_IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  REMEDIATION_PLANNED: ['REMEDIATION_IN_PROGRESS', 'MONITORING', 'RESOLVED', 'CLOSED'],
  REMEDIATION_IN_PROGRESS: ['MONITORING', 'RESOLVED', 'CLOSED'],
  MONITORING: ['RESOLVED', 'UNDER_INVESTIGATION', 'CLOSED'],
  RESOLVED: ['CLOSED', 'UNDER_INVESTIGATION'],
  CLOSED: ['UNDER_INVESTIGATION'],
};

export const aiIncidentRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/ai-incidents — List AI incidents, filterable by status, severity, governedAssetId
  app.get<{
    Querystring: {
      status?: AiIncidentStatus;
      severity?: Severity;
      governedAssetId?: string;
    };
  }>('/', { preHandler: requirePermission('AI_INCIDENT_VIEW') }, async (request) => {
    const { status, severity, governedAssetId } = request.query;

    const incidents = await db.aiIncident.findMany({
      where: {
        ...(status && { status }),
        ...(severity && { severity }),
        ...(governedAssetId && { governedAssetId }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        asset: { select: { id: true, name: true, assetType: true } },
        relatedIncident: { select: { id: true, title: true, status: true, severity: true } },
        driftEvent: { select: { id: true, metricName: true, computedScore: true, state: true } },
        _count: { select: { timelineEntries: true } },
      },
    });

    return { success: true, data: incidents };
  });

  // POST /api/v1/ai-incidents — Create a new AI incident manually
  app.post<{
    Body: {
      governedAssetId?: string;
      relatedIncidentId?: string;
      driftEventId?: string;
      incidentType: AiIncidentType;
      title: string;
      description: string;
      severity: Severity;
    };
  }>('/', { preHandler: requirePermission('AI_INCIDENT_MANAGE') }, async (request, reply) => {
    const { governedAssetId, relatedIncidentId, driftEventId, incidentType, title, description, severity } = request.body ?? {};

    if (!incidentType || !title || !description || !severity) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'MISSING_PARAM',
          message: 'incidentType, title, description, and severity are required',
        },
      });
    }

    const validTypes: AiIncidentType[] = [
      'MODEL_DRIFT',
      'HARMFUL_OUTPUT',
      'UNEXPECTED_BEHAVIOR',
      'RELIABILITY_FAILURE',
      'POLICY_VIOLATION',
      'GOVERNANCE_CONTROL_FAILURE',
      'DATA_ISSUE',
      'PERFORMANCE_DEGRADATION',
      'HALLUCINATION',
    ];
    if (!validTypes.includes(incidentType)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_INCIDENT_TYPE',
          message: `incidentType must be one of: ${validTypes.join(', ')}`,
        },
      });
    }

    const validSeverities: Severity[] = ['P1', 'P2', 'P3', 'P4', 'P5'];
    if (!validSeverities.includes(severity)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_SEVERITY',
          message: `severity must be one of: ${validSeverities.join(', ')}`,
        },
      });
    }

    const actorId = request.user?.subject;
    const actorDisplayName = request.user?.displayName;
    const validUserId = await getValidUserId(actorId);

    // Create AI Incident
    const incident = await db.aiIncident.create({
      data: {
        governedAssetId: governedAssetId ?? null,
        relatedIncidentId: relatedIncidentId ?? null,
        driftEventId: driftEventId ?? null,
        incidentType,
        title,
        description,
        severity,
        status: 'DETECTED',
      },
    });

    // Create initial timeline entry
    await db.aiIncidentTimelineEntry.create({
      data: {
        aiIncidentId: incident.id,
        entryType: 'EVIDENCE',
        description: `AI Incident created (${incidentType}). Title: ${title}`,
        metadata: {
          severity,
          governedAssetId: governedAssetId ?? null,
        },
        actorSubject: actorId ?? null,
        ...(validUserId ? { actorId: validUserId } : {}),
      },
    });

    // Log to AuditLog
    await db.auditLog.create({
      data: {
        ...(validUserId ? { actorId: validUserId } : {}),
        actorType: 'USER',
        action: 'CREATE_AI_INCIDENT',
        targetType: 'ai_incident',
        targetId: incident.id,
        metadata: {
          actorSubject: actorId ?? null,
          actorDisplayName: actorDisplayName ?? null,
          title: incident.title,
          incidentType: incident.incidentType,
          severity: incident.severity,
        },
      },
    });

    return reply.status(201).send({ success: true, data: incident });
  });

  // GET /api/v1/ai-incidents/:id — Detail view of an AI incident with timeline
  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: requirePermission('AI_INCIDENT_VIEW') },
    async (request, reply) => {
      const incidentId = request.params.id;

      const incident = await db.aiIncident.findUnique({
        where: { id: incidentId },
        include: {
          asset: true,
          relatedIncident: true,
          driftEvent: true,
          timelineEntries: {
            orderBy: { createdAt: 'asc' },
            include: {
              actor: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });

      if (!incident) {
        return reply.status(404).send({
          success: false,
          error: { code: 'AI_INCIDENT_NOT_FOUND', message: `AI incident with id '${incidentId}' not found` },
        });
      }

      return { success: true, data: incident };
    }
  );

  // POST /api/v1/ai-incidents/:id/timeline — Add a timeline entry to an AI incident
  app.post<{
    Params: { id: string };
    Body: {
      entryType: AiIncidentTimelineEntryType;
      description: string;
      metadata?: Record<string, unknown>;
    };
  }>('/:id/timeline', { preHandler: requirePermission('AI_INCIDENT_MANAGE') }, async (request, reply) => {
    const incidentId = request.params.id;
    const { entryType, description, metadata } = request.body ?? {};

    if (!entryType || !description) {
      return reply.status(400).send({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'entryType and description are required' },
      });
    }

    const validEntryTypes: AiIncidentTimelineEntryType[] = [
      'IMPACT',
      'EVIDENCE',
      'CONTAINMENT',
      'INVESTIGATION',
      'REMEDIATION',
      'APPROVAL',
      'CLOSURE',
    ];
    if (!validEntryTypes.includes(entryType)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_ENTRY_TYPE',
          message: `entryType must be one of: ${validEntryTypes.join(', ')}`,
        },
      });
    }

    const incident = await db.aiIncident.findUnique({ where: { id: incidentId } });
    if (!incident) {
      return reply.status(404).send({
        success: false,
        error: { code: 'AI_INCIDENT_NOT_FOUND', message: `AI incident with id '${incidentId}' not found` },
      });
    }

    const actorId = request.user?.subject;
    const actorDisplayName = request.user?.displayName;
    const validUserId = await getValidUserId(actorId);

    const timelineEntry = await db.aiIncidentTimelineEntry.create({
      data: {
        aiIncidentId: incident.id,
        entryType,
        description,
        metadata: (metadata ?? {}) as any,
        actorSubject: actorId ?? null,
        ...(validUserId ? { actorId: validUserId } : {}),
      },
    });

    // Log to AuditLog
    await db.auditLog.create({
      data: {
        ...(validUserId ? { actorId: validUserId } : {}),
        actorType: 'USER',
        action: 'ADD_AI_INCIDENT_TIMELINE_ENTRY',
        targetType: 'ai_incident',
        targetId: incident.id,
        metadata: {
          actorSubject: actorId ?? null,
          actorDisplayName: actorDisplayName ?? null,
          timelineEntryId: timelineEntry.id,
          entryType,
          description,
        },
      },
    });

    return reply.status(201).send({ success: true, data: timelineEntry });
  });

  // POST /api/v1/ai-incidents/:id/status — Transition status of an AI incident
  app.post<{
    Params: { id: string };
    Body: {
      targetStatus: AiIncidentStatus;
      notes?: string;
    };
  }>('/:id/status', { preHandler: requirePermission('AI_INCIDENT_MANAGE') }, async (request, reply) => {
    const incidentId = request.params.id;
    const { targetStatus, notes } = request.body ?? {};

    if (!targetStatus) {
      return reply.status(400).send({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'targetStatus is required' },
      });
    }

    const incident = await db.aiIncident.findUnique({ where: { id: incidentId } });
    if (!incident) {
      return reply.status(404).send({
        success: false,
        error: { code: 'AI_INCIDENT_NOT_FOUND', message: `AI incident with id '${incidentId}' not found` },
      });
    }

    const currentStatus = incident.status;
    const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus] ?? [];

    if (!allowed.includes(targetStatus)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot transition AI incident from ${currentStatus} to ${targetStatus}. Allowed transitions: ${allowed.join(', ')}`,
        },
      });
    }

    const actorId = request.user?.subject;
    const actorDisplayName = request.user?.displayName;
    const validUserId = await getValidUserId(actorId);

    const isResolvedOrClosed = targetStatus === 'RESOLVED' || targetStatus === 'CLOSED';

    const updatedIncident = await db.aiIncident.update({
      where: { id: incidentId },
      data: {
        status: targetStatus,
        ...(isResolvedOrClosed ? { resolvedAt: new Date() } : {}),
      },
    });

    // Add timeline entry for status transition
    let entryType: AiIncidentTimelineEntryType = 'INVESTIGATION';
    if (targetStatus === 'RESOLVED' || targetStatus === 'CLOSED') {
      entryType = 'CLOSURE';
    } else if (targetStatus === 'REMEDIATION_PLANNED' || targetStatus === 'REMEDIATION_IN_PROGRESS') {
      entryType = 'REMEDIATION';
    }

    await db.aiIncidentTimelineEntry.create({
      data: {
        aiIncidentId: incident.id,
        entryType,
        description: `Status changed from ${currentStatus} to ${targetStatus}.${notes ? ` Notes: ${notes}` : ''}`,
        metadata: {
          previousStatus: currentStatus,
          newStatus: targetStatus,
          notes: notes ?? null,
        },
        actorSubject: actorId ?? null,
        ...(validUserId ? { actorId: validUserId } : {}),
      },
    });

    // Log to AuditLog
    await db.auditLog.create({
      data: {
        ...(validUserId ? { actorId: validUserId } : {}),
        actorType: 'USER',
        action: 'TRANSITION_AI_INCIDENT_STATUS',
        targetType: 'ai_incident',
        targetId: incident.id,
        metadata: {
          actorSubject: actorId ?? null,
          actorDisplayName: actorDisplayName ?? null,
          previousStatus: currentStatus,
          newStatus: targetStatus,
          notes: notes ?? null,
        },
      },
    });

    return reply.status(200).send({ success: true, data: updatedIncident });
  });
};
