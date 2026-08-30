import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';

describe('Auth Middleware Fail-Closed & Fallback Behavior (R-17)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    delete process.env['ENABLE_DEMO_AUTH'];
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    delete process.env['ENABLE_DEMO_AUTH'];
    await app.close();
  });

  it('Fails closed by default when ENABLE_DEMO_AUTH is unset (HTTP 401 on protected route)', async () => {
    delete process.env['ENABLE_DEMO_AUTH'];

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/simulator/heal',
      payload: {},
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('Allows dev-fallback ONLY when ENABLE_DEMO_AUTH=true is explicitly set', async () => {
    process.env['ENABLE_DEMO_AUTH'] = 'true';

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/simulator/heal',
      headers: {
        'x-operator-id': 'dev-user-commander',
      },
      payload: {},
    });

    // POST /api/v1/simulator/heal requires REMEDIATION_EXECUTE permission (dev-user-commander has it)
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);

    delete process.env['ENABLE_DEMO_AUTH'];
  });
});
