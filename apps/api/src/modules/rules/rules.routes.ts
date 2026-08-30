import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../lib/db.js';
import { requirePermission } from '../auth/auth.middleware.js';

export const rulesRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/rules — List all threshold rules
  app.get('/', {
    schema: {
      tags: ['rules'],
      summary: 'List all threshold rules',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: { type: 'object', additionalProperties: true } },
          },
        },
      },
    },
  }, async () => {
    const rules = await db.thresholdRule.findMany({
      include: { service: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { success: true, data: rules };
  });

  // POST /api/v1/rules — Create a threshold rule (requires REMEDIATION_APPROVE)
  app.post<{
    Body: {
      name: string;
      metric: string;
      operator: string;
      threshold: number;
      durationSec?: number;
      severity?: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
      serviceId?: string;
      isEnabled?: boolean;
    };
  }>('/', {
    preHandler: requirePermission('REMEDIATION_APPROVE'),
    schema: {
      tags: ['rules'],
      summary: 'Create a new threshold rule',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['name', 'metric', 'operator', 'threshold'],
        properties: {
          name: { type: 'string' },
          metric: { type: 'string' },
          operator: { type: 'string' },
          threshold: { type: 'number' },
          durationSec: { type: 'number' },
          severity: { type: 'string', enum: ['P1', 'P2', 'P3', 'P4', 'P5'] },
          serviceId: { type: 'string' },
          isEnabled: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const { name, metric, operator, threshold, durationSec, severity, serviceId, isEnabled } = request.body;


    if (!name || !metric || !operator || threshold === undefined) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Name, metric, operator, and threshold are required' },
      });
    }

    const rule = await db.thresholdRule.create({
      data: {
        name,
        metric,
        operator,
        threshold: Number(threshold),
        durationSec: durationSec ? Number(durationSec) : 0,
        severity: (severity as never) ?? 'P2',
        serviceId: serviceId || null,
        isEnabled: isEnabled !== undefined ? isEnabled : true,
      },
      include: { service: { select: { id: true, name: true, slug: true } } },
    });

    return reply.status(201).send({ success: true, data: rule });
  });

  // PUT /api/v1/rules/:id — Update a threshold rule (requires REMEDIATION_APPROVE)
  app.put<{
    Params: { id: string };
    Body: {
      name?: string;
      metric?: string;
      operator?: string;
      threshold?: number;
      durationSec?: number;
      severity?: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
      serviceId?: string;
      isEnabled?: boolean;
    };
  }>('/:id', { preHandler: requirePermission('REMEDIATION_APPROVE') }, async (request, reply) => {
    const { id } = request.params;
    const { name, metric, operator, threshold, durationSec, severity, serviceId, isEnabled } = request.body;

    const existing = await db.thresholdRule.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Rule not found' } });
    }

    const updated = await db.thresholdRule.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(metric && { metric }),
        ...(operator && { operator }),
        ...(threshold !== undefined && { threshold: Number(threshold) }),
        ...(durationSec !== undefined && { durationSec: Number(durationSec) }),
        ...(severity && { severity: severity as never }),
        ...(serviceId !== undefined && { serviceId: serviceId || null }),
        ...(isEnabled !== undefined && { isEnabled }),
      },
      include: { service: { select: { id: true, name: true, slug: true } } },
    });

    return { success: true, data: updated };
  });

  // DELETE /api/v1/rules/:id — Delete a threshold rule (requires REMEDIATION_APPROVE)
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: requirePermission('REMEDIATION_APPROVE') }, async (request, reply) => {
    const { id } = request.params;

    const existing = await db.thresholdRule.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Rule not found' } });
    }

    await db.thresholdRule.delete({ where: { id } });
    return { success: true, data: { id, deleted: true } };
  });
};
