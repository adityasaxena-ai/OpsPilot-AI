import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getConfig } from '@opspilot/config';
import { evaluatePredictionMonitor } from '@opspilot/detection';
import { db } from '../../lib/db.js';
import { requirePermission } from '../auth/auth.middleware.js';

export const VALID_PREDICTION_METRICS = [
  'cpuPercent',
  'memoryPercent',
  'latencyP50Ms',
  'latencyP99Ms',
  'errorRatePercent',
  'throughputRps',
  'dbConnectionsActive',
  'dbConnectionsMax',
  'queueDepth',
  'healthScore',
] as const;

async function getValidUserId(subject: string | undefined): Promise<string | null> {
  if (!subject) return null;
  const user = await db.user.findUnique({ where: { id: subject } });
  return user ? user.id : null;
}

export async function predictionRoutes(app: FastifyInstance): Promise<void> {
  // Feature flag hook: 404 for all routes when flag is OFF
  app.addHook('onRequest', async (_request: FastifyRequest, reply: FastifyReply) => {
    const config = getConfig();
    if (!config.ENABLE_PREDICTIVE_INTELLIGENCE) {
      reply.status(404).send({
        message: `Route ${_request.method}:${_request.url} not found`,
        error: 'Not Found',
        statusCode: 404,
      });
    }
  });

  // POST /api/v1/predictions/monitors
  app.post<{
    Body: {
      serviceId: string;
      metricName: string;
      threshold: number;
      horizonMinutes: number;
      minimumSamples?: number;
    };
  }>('/monitors', { preHandler: requirePermission('PREDICTION_MANAGE') }, async (request, reply) => {
    const { serviceId, metricName, threshold, horizonMinutes, minimumSamples = 5 } = request.body || {};

    if (!serviceId || !metricName || threshold === undefined || !horizonMinutes) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'serviceId, metricName, threshold, and horizonMinutes are required.',
        },
      });
    }

    if (!VALID_PREDICTION_METRICS.includes(metricName as (typeof VALID_PREDICTION_METRICS)[number])) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_METRIC',
          message: `Invalid metricName '${metricName}'. Must be one of: ${VALID_PREDICTION_METRICS.join(', ')}.`,
        },
      });
    }

    const service = await db.service.findUnique({ where: { id: serviceId } });
    if (!service) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'SERVICE_NOT_FOUND',
          message: `Service with ID '${serviceId}' not found.`,
        },
      });
    }

    const monitor = await db.predictionMonitor.create({
      data: {
        serviceId,
        metricName,
        threshold: Number(threshold),
        horizonMinutes: Number(horizonMinutes),
        minimumSamples: Number(minimumSamples),
      },
    });

    const actorSubject = request.user?.subject || 'dev-user-admin';
    const actorDisplayName = request.user?.displayName || request.user?.subject || 'Dev Admin';

    await db.auditLog.create({
      data: {
        actorType: 'USER',
        action: 'CREATE_PREDICTION_MONITOR',
        targetType: 'prediction_monitor',
        targetId: monitor.id,
        metadata: {
          actorSubject,
          actorDisplayName,
          serviceId,
          metricName,
          threshold,
          horizonMinutes,
        },
        result: 'SUCCESS',
      },
    });

    return reply.status(201).send({ success: true, data: monitor });
  });

  // GET /api/v1/predictions/monitors
  app.get<{
    Querystring: { serviceId?: string };
  }>('/monitors', { preHandler: requirePermission('PREDICTION_VIEW') }, async (request) => {
    const { serviceId } = request.query;

    const monitors = await db.predictionMonitor.findMany({
      where: serviceId ? { serviceId } : {},
      include: {
        service: {
          select: { id: true, name: true, slug: true, environment: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: monitors };
  });

  // POST /api/v1/predictions/monitors/:id/evaluate
  app.post<{
    Params: { id: string };
    Body: { samples: Array<{ timestamp: number; value: number }> };
  }>('/monitors/:id/evaluate', { preHandler: requirePermission('PREDICTION_MANAGE') }, async (request, reply) => {
    const { id } = request.params;
    const { samples } = request.body || {};

    if (!Array.isArray(samples)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'samples must be an array of { timestamp, value } objects.',
        },
      });
    }

    const monitor = await db.predictionMonitor.findUnique({ where: { id } });
    if (!monitor) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'MONITOR_NOT_FOUND',
          message: `Prediction monitor '${id}' not found.`,
        },
      });
    }

    const evalResult = evaluatePredictionMonitor(
      {
        metricName: monitor.metricName,
        threshold: monitor.threshold,
        horizonMinutes: monitor.horizonMinutes,
        minimumSamples: monitor.minimumSamples,
      },
      samples
    );

    const expiresAt = new Date(Date.now() + monitor.horizonMinutes * 60 * 1000);

    // NOTE: Each evaluation call creates a new Prediction record (point-in-time snapshot).
    // Predictions are not updated in place because each prediction's evidence samples are specific
    // to the exact timestamp window when evaluated.
    const prediction = await db.prediction.create({
      data: {
        predictionMonitorId: monitor.id,
        serviceId: monitor.serviceId,
        metricName: monitor.metricName,
        status: evalResult.status,
        projectedValue: evalResult.projectedValue,
        confidence: evalResult.confidence,
        horizonMinutes: monitor.horizonMinutes,
        threshold: monitor.threshold,
        evidenceSamples: samples,
        trendSlope: evalResult.trendSlope,
        explanation: evalResult.explanation,
        expiresAt,
      },
    });

    const actorSubject = request.user?.subject || 'dev-user-admin';
    const actorDisplayName = request.user?.displayName || request.user?.subject || 'Dev Admin';

    await db.auditLog.create({
      data: {
        actorType: 'USER',
        action: 'EVALUATE_PREDICTION',
        targetType: 'prediction',
        targetId: prediction.id,
        metadata: {
          actorSubject,
          actorDisplayName,
          serviceId: monitor.serviceId,
          metricName: monitor.metricName,
          status: evalResult.status,
          confidence: evalResult.confidence,
          projectedValue: evalResult.projectedValue,
        },
        aiConfidence: evalResult.confidence,
        result: 'SUCCESS',
      },
    });

    return { success: true, data: prediction };
  });

  // GET /api/v1/predictions
  app.get<{
    Querystring: { serviceId?: string; status?: string; predictionMonitorId?: string };
  }>('/', { preHandler: requirePermission('PREDICTION_VIEW') }, async (request) => {
    const { serviceId, status, predictionMonitorId } = request.query;

    const predictions = await db.prediction.findMany({
      where: {
        ...(serviceId ? { serviceId } : {}),
        ...(status ? { status: status as any } : {}),
        ...(predictionMonitorId ? { predictionMonitorId } : {}),
      },
      include: {
        predictionMonitor: {
          select: { id: true, isEnabled: true, minimumSamples: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: predictions };
  });

  // GET /api/v1/predictions/:id
  app.get<{
    Params: { id: string };
  }>('/:id', { preHandler: requirePermission('PREDICTION_VIEW') }, async (request, reply) => {
    const { id } = request.params;

    const prediction = await db.prediction.findUnique({
      where: { id },
      include: {
        predictionMonitor: true,
      },
    });

    if (!prediction) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'PREDICTION_NOT_FOUND',
          message: `Prediction '${id}' not found.`,
        },
      });
    }

    return { success: true, data: prediction };
  });

  // POST /api/v1/predictions/:id/review
  app.post<{
    Params: { id: string };
    Body: { notes?: string };
  }>('/:id/review', { preHandler: requirePermission('PREDICTION_MANAGE') }, async (request, reply) => {
    const { id } = request.params;
    const { notes } = request.body || {};

    const existing = await db.prediction.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'PREDICTION_NOT_FOUND',
          message: `Prediction '${id}' not found.`,
        },
      });
    }

    const actorSubject = request.user?.subject || 'dev-user-admin';
    const actorDisplayName = request.user?.displayName || request.user?.subject || 'Dev Admin';
    const validUserId = await getValidUserId(actorSubject);

    const updated = await db.prediction.update({
      where: { id },
      data: {
        reviewedById: validUserId,
        reviewedBySubject: actorSubject,
        reviewNotes: notes || 'Reviewed by operator',
      },
    });

    await db.auditLog.create({
      data: {
        actorType: 'USER',
        action: 'REVIEW_PREDICTION',
        targetType: 'prediction',
        targetId: id,
        metadata: {
          actorSubject,
          actorDisplayName,
          notes: notes || 'Reviewed by operator',
        },
        result: 'SUCCESS',
      },
    });

    return { success: true, data: updated };
  });
}
