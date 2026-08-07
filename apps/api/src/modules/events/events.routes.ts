import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { CanonicalEventSchema } from '@opspilot/types';
import { ingestEvent } from './event.service.js';
import { db } from '../../lib/db.js';

export const eventsRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/v1/events — ingest a canonical event
  app.post('/', async (request, reply) => {
    const result = CanonicalEventSchema.safeParse(request.body);

    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid event payload', details: result.error.flatten() },
      });
    }

    const outcome = await ingestEvent(result.data);

    return reply.status(201).send({
      success: true,
      data: outcome,
    });
  });

  // GET /api/v1/events
  app.get<{
    Querystring: { serviceId?: string; limit?: string; offset?: string };
  }>('/', async (request) => {
    const { serviceId, limit = '20', offset = '0' } = request.query;

    const [events, total] = await Promise.all([
      db.event.findMany({
        where: { ...(serviceId ? { serviceId } : {}), isDuplicate: false },
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit, 10), 100),
        skip: parseInt(offset, 10),
      }),
      db.event.count({ where: { isDuplicate: false } }),
    ]);

    return {
      success: true,
      data: events,
      meta: { total, limit: parseInt(limit, 10), offset: parseInt(offset, 10) },
    };
  });
};
