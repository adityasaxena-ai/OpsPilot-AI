import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../lib/db.js';

export const servicesRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/services — list all services with current health
  app.get('/', async () => {
    const services = await db.service.findMany({
      include: {
        simState: true,
        dependsOn: {
          include: { dependsOn: { select: { id: true, name: true, slug: true } } },
        },
        _count: {
          select: {
            incidents: { where: { status: { not: 'RESOLVED' } } },
            alerts: { where: { status: 'ACTIVE' } },
          },
        },
      },
      orderBy: [{ tier: 'asc' }, { name: 'asc' }],
    });

    return {
      success: true,
      data: services,
      meta: { total: services.length },
    };
  });

  // GET /api/v1/services/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const service = await db.service.findUnique({
      where: { id: request.params['id'] },
      include: {
        simState: true,
        dependsOn: { include: { dependsOn: true } },
        dependedOnBy: { include: { service: true } },
        incidents: {
          where: { status: { not: 'RESOLVED' } },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        runbooks: { where: { isActive: true } },
      },
    });

    if (!service) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Service not found' } });
    }

    return { success: true, data: service };
  });

  // GET /api/v1/services/:id/health
  app.get<{ Params: { id: string } }>('/:id/health', async (request, reply) => {
    const simState = await db.simService.findUnique({
      where: { serviceId: request.params['id'] },
    });

    if (!simState) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Service not found' } });
    }

    return { success: true, data: simState };
  });

  // GET /api/v1/services/:id/dependencies
  app.get<{ Params: { id: string } }>('/:id/dependencies', async (request, reply) => {
    const deps = await db.serviceDependency.findMany({
      where: { serviceId: request.params['id'] },
      include: {
        dependsOn: { include: { simState: true } },
      },
    });

    return { success: true, data: deps };
  });

  // GET /api/v1/services/:id/incidents
  app.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/:id/incidents',
    async (request) => {
      const limit = parseInt(request.query['limit'] ?? '10', 10);
      const incidents = await db.incident.findMany({
        where: { serviceId: request.params['id'] },
        orderBy: { detectedAt: 'desc' },
        take: Math.min(limit, 50),
      });
      return { success: true, data: incidents };
    },
  );
};
