import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../lib/db.js';

export const auditRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/audit
  app.get<{
    Querystring: { incidentId?: string; actorType?: string; action?: string; limit?: string; offset?: string };
  }>('/', async (request) => {
    const { incidentId, actorType, action, limit = '50', offset = '0' } = request.query;

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where: {
          ...(incidentId ? { incidentId } : {}),
          ...(actorType ? { actorType: actorType as never } : {}),
          ...(action ? { action: { contains: action, mode: 'insensitive' } } : {}),
        },
        include: {
          actor: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit, 10), 200),
        skip: parseInt(offset, 10),
      }),
      db.auditLog.count({
        where: {
          ...(incidentId ? { incidentId } : {}),
          ...(actorType ? { actorType: actorType as never } : {}),
        },
      }),
    ]);

    return {
      success: true,
      data: logs,
      meta: { total, limit: parseInt(limit, 10), offset: parseInt(offset, 10) },
    };
  });

  // GET /api/v1/audit/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const log = await db.auditLog.findUnique({
      where: { id: request.params['id'] },
      include: {
        actor: { select: { id: true, name: true, email: true } },
        incident: { select: { id: true, title: true } },
      },
    });

    if (!log) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Audit log not found' } });
    }

    return { success: true, data: log };
  });
};
