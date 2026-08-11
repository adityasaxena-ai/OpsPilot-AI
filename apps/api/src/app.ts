import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { getConfig } from '@opspilot/config';
import { healthRoutes } from './modules/health/health.routes.js';
import { servicesRoutes } from './modules/services/services.routes.js';
import { alertsRoutes } from './modules/alerts/alerts.routes.js';
import { incidentsRoutes } from './modules/incidents/incidents.routes.js';
import { eventsRoutes } from './modules/events/events.routes.js';
import { simulatorRoutes } from './modules/simulator/simulator.routes.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import { auditRoutes } from './modules/audit/audit.routes.js';
import { streamRoutes } from './modules/stream/stream.routes.js';
import { aiRoutes } from './modules/ai/ai.routes.js';
import { remediationRoutes } from './modules/remediation/remediation.routes.js';
import { integrationRoutes } from './modules/integrations/integrations.routes.js';
import { telemetryRoutes } from './modules/telemetry/telemetry.routes.js';
import { rulesRoutes } from './modules/rules/rules.routes.js';
import { db } from './lib/db.js';
import { redis } from './lib/redis.js';
import { startSimulatorTick, stopSimulatorTick } from './modules/simulator/simulator.service.js';

export async function buildApp() {
  const config = getConfig();

  const app = Fastify({
    logger:
      config.NODE_ENV === 'development'
        ? {
            level: config.LOG_LEVEL,
            transport: { target: 'pino-pretty', options: { colorize: true } },
          }
        : {
            level: config.LOG_LEVEL,
          },
  });

  // ── Custom JSON content type parser (handles empty body gracefully) ──
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    try {
      const str = typeof body === 'string' ? body : body ? body.toString('utf8') : '';
      const json = JSON.parse(str.trim() || '{}');
      done(null, json);
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // ── Security plugins ──────────────────────────────────────────────────
  await app.register(helmet, { global: true });
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (curl, postman, server-to-server)
      if (!origin) return cb(null, true);
      // Allow configured WEB_URL or any vercel.app preview domain or localhost
      if (
        origin === config.WEB_URL ||
        origin.endsWith('.vercel.app') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
      ) {
        return cb(null, true);
      }
      return cb(null, true);
    },
    credentials: true,
  });
  await app.register(rateLimit, {
    max: 500,
    timeWindow: '1 minute',
  });

  // ── Database + Redis lifecycle ─────────────────────────────────────────
  app.addHook('onClose', async () => {
    stopSimulatorTick();
    await db.$disconnect();
    redis.disconnect();
  });

  // Start simulator tick loop after app is ready
  app.addHook('onReady', async () => {
    const { SIMULATOR_TICK_INTERVAL_MS } = getConfig();
    startSimulatorTick(SIMULATOR_TICK_INTERVAL_MS);
  });

  // ── Routes ──────────────────────────────────────────────────────────────
  app.get('/', async () => ({
    name: 'OpsPilot API',
    status: 'healthy',
    version: '0.1.0',
    health: '/health',
  }));
  await app.register(healthRoutes, { prefix: '/health' });
  await app.register(eventsRoutes, { prefix: '/api/v1/events' });
  await app.register(alertsRoutes, { prefix: '/api/v1/alerts' });
  await app.register(incidentsRoutes, { prefix: '/api/v1/incidents' });
  await app.register(servicesRoutes, { prefix: '/api/v1/services' });
  await app.register(simulatorRoutes, { prefix: '/api/v1/simulator' });
  await app.register(analyticsRoutes, { prefix: '/api/v1/analytics' });
  await app.register(auditRoutes, { prefix: '/api/v1/audit' });
  await app.register(streamRoutes, { prefix: '/api/v1/stream' });
  await app.register(aiRoutes, { prefix: '/api/v1/ai' });
  await app.register(remediationRoutes, { prefix: '/api/v1/remediation' });
  await app.register(integrationRoutes, { prefix: '/api/v1/integrations' });
  await app.register(telemetryRoutes, { prefix: '/api/v1/telemetry' });
  await app.register(rulesRoutes, { prefix: '/api/v1/rules' });

  // ── Global error handler ───────────────────────────────────────────────
  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode ?? 500;
    void reply.status(statusCode).send({
      success: false,
      error: {
        code: error.code ?? 'INTERNAL_ERROR',
        message: statusCode === 500 ? 'Internal server error' : error.message,
      },
    });
  });

  return app;
}
