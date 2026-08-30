import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../app.js';
import { db } from '../../lib/db.js';
import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';

describe('AI Routes Integration & Auth Tests (ai.routes.ts R-18)', () => {
  let app: FastifyInstance;
  let sreToken: string;

  beforeAll(async () => {
    delete process.env['ENABLE_DEMO_AUTH'];
    app = await buildApp();
    await app.ready();

    // Seed test user with SRE_OPERATOR role
    const passwordHash = await argon2.hash('OpsPilot2026!sretest');
    await db.user.upsert({
      where: { username: 'sretestuser' },
      update: { passwordHash, role: 'SRE_OPERATOR' },
      create: {
        username: 'sretestuser',
        passwordHash,
        role: 'SRE_OPERATOR',
        email: 'sretestuser@opspilot.dev',
        name: 'SRE Test User',
      },
    });

    // Obtain JWT token via real login endpoint
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        username: 'sretestuser',
        password: 'OpsPilot2026!sretest',
      },
    });

    const loginBody = JSON.parse(loginRes.payload);
    sreToken = loginBody.data.token;
  });

  afterAll(async () => {
    delete process.env['ENABLE_DEMO_AUTH'];
    await db.user.deleteMany({ where: { username: 'sretestuser' } });
    await app.close();
  });

  it('POST /api/v1/ai/triage — rejects unauthenticated request with HTTP 401 AUTHENTICATION_REQUIRED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/triage',
      payload: { incidentId: 'clxxxxxxxxxxxxxxxxx' },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('POST /api/v1/ai/chat — permits authenticated request with valid Bearer JWT', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/chat',
      headers: {
        authorization: `Bearer ${sreToken}`,
      },
      payload: { message: 'Explain database CPU spike troubleshooting' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.reply).toBeDefined();
  });
});
