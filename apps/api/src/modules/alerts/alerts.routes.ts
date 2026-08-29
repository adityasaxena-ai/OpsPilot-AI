import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../lib/db.js';
import type { AlertStatus } from '@opspilot/types';
import { requirePermission } from '../auth/auth.middleware.js';

export const alertsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/alerts
  app.get<{
    Querystring: { status?: string; severity?: string; serviceId?: string; limit?: string; offset?: string };
  }>('/', async (request) => {
    const { status, severity, serviceId, limit = '20', offset = '0' } = request.query;

    const where = {
      ...(status ? { status: status as AlertStatus } : {}),
      ...(severity ? { severity: severity as never } : {}),
      ...(serviceId ? { serviceId } : {}),
    };

    const [alerts, total] = await Promise.all([
      db.alert.findMany({
        where,
        include: { service: { select: { id: true, name: true, slug: true, tier: true } } },
        orderBy: { lastSeenAt: 'desc' },
        take: Math.min(parseInt(limit, 10), 100),
        skip: parseInt(offset, 10),
      }),
      db.alert.count({ where }),
    ]);

    return {
      success: true,
      data: alerts,
      meta: { total, limit: parseInt(limit, 10), offset: parseInt(offset, 10) },
    };
  });

  // GET /api/v1/alerts/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const alert = await db.alert.findUnique({
      where: { id: request.params['id'] },
      include: {
        service: true,
        alertGroupMemberships: {
          include: { alertGroup: { include: { incident: true } } },
        },
      },
    });

    if (!alert) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Alert not found' } });
    }

    return { success: true, data: alert };
  });

  // PATCH /api/v1/alerts/:id — acknowledge or suppress (requires authentication)
  app.patch<{ Params: { id: string }; Body: { status: AlertStatus } }>(
    '/:id',
    { preHandler: requirePermission('INCIDENT_VIEW') },
    async (request, reply) => {
      const { status } = request.body;
      const allowed: AlertStatus[] = ['ACKNOWLEDGED', 'SUPPRESSED', 'RESOLVED'];

      if (!allowed.includes(status)) {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_STATUS', message: `Status must be one of: ${allowed.join(', ')}` },
        });
      }

      const alert = await db.alert.update({
        where: { id: request.params['id'] },
        data: { status },
      });

      return { success: true, data: alert };
    },
  );

  // GET /api/v1/alerts/:id/related
  app.get<{ Params: { id: string } }>('/:id/related', async (request) => {
    const memberships = await db.alertGroupMember.findMany({
      where: { alertId: request.params['id'] },
      include: {
        alertGroup: {
          include: {
            members: {
              include: {
                alert: { include: { service: { select: { id: true, name: true, slug: true } } } },
              },
            },
          },
        },
      },
    });

    const relatedAlerts = memberships.flatMap((m) =>
      m.alertGroup.members.map((mem) => mem.alert).filter((a) => a.id !== request.params['id']),
    );

    return { success: true, data: relatedAlerts };
  });
};
