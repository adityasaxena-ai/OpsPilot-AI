import type { FastifyPluginAsync } from 'fastify';
import { ChaosInjectionRequestSchema } from '@opspilot/types';
import {
  getSimulatorStatus,
  injectChaos,
  healService,
  healAll,
  getScenarios,
  triggerDeployment,
} from './simulator.service.js';
import { requirePermission } from '../auth/auth.middleware.js';

export const simulatorRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/simulator/status
  app.get('/status', async () => {
    const status = await getSimulatorStatus();
    return { success: true, data: status };
  });

  // GET /api/v1/simulator/scenarios
  app.get('/scenarios', async () => {
    return { success: true, data: getScenarios() };
  });

  // POST /api/v1/simulator (or /api/v1/simulator/chaos)
  // Requires REMEDIATION_EXECUTE — chaos injection is a high-risk control-plane action.
  const handleChaosInjection = async (request: any, reply: any) => {
    const result = ChaosInjectionRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid chaos request', details: result.error.flatten() },
      });
    }

    const outcome = await injectChaos(result.data);
    return reply.status(201).send({ success: true, data: outcome });
  };

  // Tight per-IP rate limit on chaos mutations: 30 req/min (overrides global 200/min).
  const CHAOS_RATE_LIMIT = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } } as const;

  app.post('/', { preHandler: requirePermission('REMEDIATION_EXECUTE'), ...CHAOS_RATE_LIMIT }, handleChaosInjection);
  app.post('/chaos', { preHandler: requirePermission('REMEDIATION_EXECUTE'), ...CHAOS_RATE_LIMIT }, handleChaosInjection);

  // POST /api/v1/simulator/heal
  app.post('/heal', { preHandler: requirePermission('REMEDIATION_EXECUTE'), ...CHAOS_RATE_LIMIT }, async (request) => {
    const body = request.body as { serviceId?: string } | undefined;
    if (body?.serviceId) {
      await healService(body.serviceId);
      return { success: true, data: { healed: [body.serviceId] } };
    }
    await healAll();
    return { success: true, data: { healed: 'all' } };
  });

  // POST /api/v1/simulator/deploy
  app.post('/deploy', { preHandler: requirePermission('REMEDIATION_EXECUTE'), ...CHAOS_RATE_LIMIT }, async (request, reply) => {
    const body = request.body as { serviceId: string; isBadDeployment?: boolean; version?: string };
    if (!body?.serviceId) {
      return reply.status(400).send({ success: false, error: { code: 'MISSING_FIELD', message: 'serviceId required' } });
    }

    const deployment = await triggerDeployment(body.serviceId, body.isBadDeployment ?? false, body.version);
    return reply.status(201).send({ success: true, data: deployment });
  });
};
