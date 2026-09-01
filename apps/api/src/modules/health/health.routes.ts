import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../lib/db.js';
import { redis } from '../../lib/redis.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', {
    schema: {
      tags: ['health'],
      summary: 'System healthcheck and dependency status',
      security: [],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            health: { type: 'string' },
            version: { type: 'string' },
            timestamp: { type: 'string' },
            dependencies: {
              type: 'object',
              properties: {
                database: { type: 'string' },
                redis: { type: 'string' },
                databaseError: { type: 'string' },
              },
            },
          },
        },
        503: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            health: { type: 'string' },
            version: { type: 'string' },
            timestamp: { type: 'string' },
            dependencies: {
              type: 'object',
              properties: {
                database: { type: 'string' },
                redis: { type: 'string' },
                databaseError: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (_request, reply) => {

    // Check DB connectivity
    let dbStatus = 'ok';
    let dbError: string | undefined = undefined;
    try {
      await db.$queryRaw`SELECT 1`;
    } catch (err) {
      dbStatus = 'error';
      dbError = err instanceof Error ? err.message : String(err);
      app.log.error(err, 'Healthcheck DB ping failed');
    }

    // Check Redis connectivity
    let redisStatus = 'ok';
    try {
      await redis.ping();
    } catch {
      redisStatus = 'error';
    }

    const isHealthy = dbStatus === 'ok' && redisStatus === 'ok';

    return reply.status(isHealthy ? 200 : 503).send({
      status: isHealthy ? 'ok' : 'degraded',
      health: isHealthy ? 'healthy' : 'degraded',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      dependencies: {
        database: dbStatus,
        redis: redisStatus,
        ...(dbError ? { databaseError: dbError } : {}),
      },
    });
  });
};
