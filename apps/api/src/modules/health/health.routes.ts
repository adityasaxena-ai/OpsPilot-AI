import type { FastifyPluginAsync } from 'fastify';
import { db } from '../../lib/db.js';
import { redis } from '../../lib/redis.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', async (_request, reply) => {
    // Check DB connectivity
    let dbStatus = 'ok';
    try {
      await db.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
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
      status: isHealthy ? 'healthy' : 'degraded',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      dependencies: {
        database: dbStatus,
        redis: redisStatus,
      },
    });
  });
};
