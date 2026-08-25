import type { FastifyPluginAsync } from 'fastify';
import type { DriftMethod, DriftState } from '@prisma/client';
import { evaluateDriftMonitor } from '@opspilot/detection';
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

export const driftRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/drift/monitors — List monitors, filterable by governedAssetId
  app.get<{
    Querystring: {
      governedAssetId?: string;
    };
  }>('/monitors', { preHandler: requirePermission('DRIFT_VIEW') }, async (request) => {
    const { governedAssetId } = request.query;

    const monitors = await db.driftMonitor.findMany({
      where: {
        ...(governedAssetId && { governedAssetId }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        asset: {
          select: { id: true, name: true, assetType: true, lifecycleStage: true },
        },
        _count: {
          select: { driftEvents: true },
        },
      },
    });

    return { success: true, data: monitors };
  });

  // POST /api/v1/drift/monitors — Create a new DriftMonitor
  app.post<{
    Body: {
      governedAssetId: string;
      metricName: string;
      method: DriftMethod;
      baselineSnapshot: unknown;
      threshold: number;
      isEnabled?: boolean;
    };
  }>('/monitors', { preHandler: requirePermission('DRIFT_MANAGE') }, async (request, reply) => {
    const { governedAssetId, metricName, method, baselineSnapshot, threshold, isEnabled } = request.body ?? {};

    if (!governedAssetId || !metricName || !method || baselineSnapshot === undefined || threshold === undefined) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'MISSING_PARAM',
          message: 'governedAssetId, metricName, method, baselineSnapshot, and threshold are required',
        },
      });
    }

    const validMethods: DriftMethod[] = ['PSI', 'ERROR_RATE_COMPARISON'];
    if (!validMethods.includes(method)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_DRIFT_METHOD',
          message: `method must be one of: ${validMethods.join(', ')}`,
        },
      });
    }

    const asset = await db.governedAsset.findUnique({ where: { id: governedAssetId } });
    if (!asset) {
      return reply.status(404).send({
        success: false,
        error: { code: 'ASSET_NOT_FOUND', message: `Governed asset with id '${governedAssetId}' not found` },
      });
    }

    const actorId = request.user?.subject;
    const actorDisplayName = request.user?.displayName;
    const validUserId = await getValidUserId(actorId);

    const monitor = await db.driftMonitor.create({
      data: {
        governedAssetId,
        metricName,
        method,
        baselineSnapshot: baselineSnapshot as any,
        threshold,
        isEnabled: isEnabled ?? true,
      },
    });

    // Log to AuditLog
    await db.auditLog.create({
      data: {
        ...(validUserId ? { actorId: validUserId } : {}),
        actorType: 'USER',
        action: 'CREATE_DRIFT_MONITOR',
        targetType: 'drift_monitor',
        targetId: monitor.id,
        metadata: {
          actorSubject: actorId ?? null,
          actorDisplayName: actorDisplayName ?? null,
          governedAssetId,
          metricName,
          method,
          threshold,
        },
      },
    });

    return reply.status(201).send({ success: true, data: monitor });
  });

  // GET /api/v1/drift/events — List drift events, filterable by state / governedAssetId
  app.get<{
    Querystring: {
      state?: DriftState;
      governedAssetId?: string;
    };
  }>('/events', { preHandler: requirePermission('DRIFT_VIEW') }, async (request) => {
    const { state, governedAssetId } = request.query;

    const events = await db.driftEvent.findMany({
      where: {
        ...(state && { state }),
        ...(governedAssetId && { governedAssetId }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        monitor: { select: { id: true, metricName: true, method: true } },
        asset: { select: { id: true, name: true, assetType: true } },
        aiIncidents: { select: { id: true, title: true, status: true, severity: true } },
      },
    });

    return { success: true, data: events };
  });

  // GET /api/v1/drift/events/:id — Detail view of a DriftEvent
  app.get<{ Params: { id: string } }>(
    '/events/:id',
    { preHandler: requirePermission('DRIFT_VIEW') },
    async (request, reply) => {
      const eventId = request.params.id;

      const event = await db.driftEvent.findUnique({
        where: { id: eventId },
        include: {
          monitor: true,
          asset: true,
          reviewedBy: { select: { id: true, name: true, email: true } },
          aiIncidents: true,
        },
      });

      if (!event) {
        return reply.status(404).send({
          success: false,
          error: { code: 'DRIFT_EVENT_NOT_FOUND', message: `Drift event with id '${eventId}' not found` },
        });
      }

      return { success: true, data: event };
    }
  );

  // POST /api/v1/drift/events/:id/observe — Accept an observed metric value and evaluate drift
  app.post<{
    Params: { id: string };
    Body: {
      observedValue: unknown;
    };
  }>('/events/:id/observe', { preHandler: requirePermission('DRIFT_MANAGE') }, async (request, reply) => {
    const targetId = request.params.id;
    const { observedValue } = request.body ?? {};

    if (observedValue === undefined) {
      return reply.status(400).send({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'observedValue is required' },
      });
    }

    // Determine if targetId is a DriftMonitor ID or DriftEvent ID
    let monitor = await db.driftMonitor.findUnique({ where: { id: targetId } });
    let openEvent = null;

    if (monitor) {
      // Find open event for this monitor
      openEvent = await db.driftEvent.findFirst({
        where: {
          driftMonitorId: monitor.id,
          state: { notIn: ['RESOLVED', 'ESCALATED'] },
        },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      // Check if targetId is an existing DriftEvent ID
      const existingEvent = await db.driftEvent.findUnique({ where: { id: targetId } });
      if (existingEvent) {
        monitor = await db.driftMonitor.findUnique({ where: { id: existingEvent.driftMonitorId } });
        if (existingEvent.state !== 'RESOLVED' && existingEvent.state !== 'ESCALATED') {
          openEvent = existingEvent;
        }
      }
    }

    if (!monitor) {
      return reply.status(404).send({
        success: false,
        error: { code: 'MONITOR_NOT_FOUND', message: `Drift monitor or open event with id '${targetId}' not found` },
      });
    }

    // Evaluate drift using explainable statistical methods
    const evalResult = evaluateDriftMonitor(
      {
        method: monitor.method,
        baselineSnapshot: monitor.baselineSnapshot,
        threshold: monitor.threshold,
      },
      observedValue
    );

    const actorId = request.user?.subject;
    const actorDisplayName = request.user?.displayName;
    const validUserId = await getValidUserId(actorId);

    let event;
    if (openEvent) {
      // Update open event
      const newState = openEvent.state === 'UNDER_REVIEW' || openEvent.state === 'VALIDATION_REMEDIATION'
        ? openEvent.state // Keep human review state
        : evalResult.state;

      event = await db.driftEvent.update({
        where: { id: openEvent.id },
        data: {
          state: newState,
          computedScore: evalResult.score,
          currentValue: observedValue as any,
          detectedAt: openEvent.detectedAt ?? (evalResult.state !== 'HEALTHY' ? new Date() : null),
        },
      });
    } else {
      // Create new DriftEvent
      event = await db.driftEvent.create({
        data: {
          driftMonitorId: monitor.id,
          governedAssetId: monitor.governedAssetId,
          state: evalResult.state,
          metricName: monitor.metricName,
          baselineValue: monitor.baselineSnapshot as any,
          currentValue: observedValue as any,
          computedScore: evalResult.score,
          threshold: monitor.threshold,
          detectedAt: evalResult.state !== 'HEALTHY' ? new Date() : null,
        },
      });
    }

    // Log to AuditLog
    await db.auditLog.create({
      data: {
        ...(validUserId ? { actorId: validUserId } : {}),
        actorType: 'USER',
        action: 'OBSERVE_DRIFT_METRIC',
        targetType: 'drift_event',
        targetId: event.id,
        metadata: {
          actorSubject: actorId ?? null,
          actorDisplayName: actorDisplayName ?? null,
          driftMonitorId: monitor.id,
          score: evalResult.score,
          state: event.state,
          explanation: evalResult.explanation,
        },
      },
    });

    return reply.status(200).send({
      success: true,
      data: {
        event,
        evaluation: evalResult,
      },
    });
  });

  // POST /api/v1/drift/events/:id/review — Perform human review action on a DriftEvent
  app.post<{
    Params: { id: string };
    Body: {
      action: 'acknowledge' | 'begin_validation' | 'resolve' | 'escalate';
      notes?: string;
    };
  }>('/events/:id/review', { preHandler: requirePermission('DRIFT_REVIEW') }, async (request, reply) => {
    const eventId = request.params.id;
    const { action, notes } = request.body ?? {};

    if (!action) {
      return reply.status(400).send({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'action is required' },
      });
    }

    const validActions = ['acknowledge', 'begin_validation', 'resolve', 'escalate'];
    if (!validActions.includes(action)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_ACTION',
          message: `action must be one of: ${validActions.join(', ')}`,
        },
      });
    }

    const event = await db.driftEvent.findUnique({
      where: { id: eventId },
      include: { asset: true },
    });

    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'DRIFT_EVENT_NOT_FOUND', message: `Drift event with id '${eventId}' not found` },
      });
    }

    const previousState = event.state;
    let newState: DriftState = event.state;

    if (action === 'acknowledge') {
      newState = 'UNDER_REVIEW';
    } else if (action === 'begin_validation') {
      newState = 'VALIDATION_REMEDIATION';
    } else if (action === 'resolve') {
      newState = 'RESOLVED';
    } else if (action === 'escalate') {
      newState = 'ESCALATED';
    }

    const actorId = request.user?.subject;
    const actorDisplayName = request.user?.displayName;
    const validUserId = await getValidUserId(actorId);

    // Update DriftEvent
    const updatedEvent = await db.driftEvent.update({
      where: { id: eventId },
      data: {
        state: newState,
        reviewedBySubject: actorId ?? null,
        ...(validUserId ? { reviewedById: validUserId } : {}),
        reviewNotes: notes ?? null,
        ...(action === 'resolve' ? { resolvedAt: new Date() } : {}),
      },
    });

    let createdAiIncident = null;

    // On escalate specifically: create linked AiIncident
    if (action === 'escalate') {
      createdAiIncident = await db.aiIncident.create({
        data: {
          governedAssetId: event.governedAssetId,
          driftEventId: event.id,
          incidentType: 'MODEL_DRIFT',
          title: `Drift Escalation: ${event.metricName} on ${event.asset.name}`,
          description: notes ?? `Model drift score (${event.computedScore}) exceeded threshold (${event.threshold}). Escalated to AI incident for formal investigation.`,
          status: 'DETECTED',
          severity: 'P2',
          detectedAt: event.detectedAt ?? new Date(),
        },
      });

      // Add initial timeline entry to AI incident
      await db.aiIncidentTimelineEntry.create({
        data: {
          aiIncidentId: createdAiIncident.id,
          entryType: 'IMPACT',
          description: `AI Incident created from escalated drift event ${event.id}. Metric: ${event.metricName}, computed score: ${event.computedScore}.`,
          actorSubject: actorId ?? null,
          ...(validUserId ? { actorId: validUserId } : {}),
        },
      });
    }

    // Log to AuditLog
    await db.auditLog.create({
      data: {
        ...(validUserId ? { actorId: validUserId } : {}),
        actorType: 'USER',
        action: 'REVIEW_DRIFT_EVENT',
        targetType: 'drift_event',
        targetId: event.id,
        metadata: {
          actorSubject: actorId ?? null,
          actorDisplayName: actorDisplayName ?? null,
          reviewAction: action,
          previousState,
          newState,
          notes: notes ?? null,
          ...(createdAiIncident ? { createdAiIncidentId: createdAiIncident.id } : {}),
        },
      },
    });

    return reply.status(200).send({
      success: true,
      data: {
        event: updatedEvent,
        createdAiIncident,
      },
    });
  });
};
