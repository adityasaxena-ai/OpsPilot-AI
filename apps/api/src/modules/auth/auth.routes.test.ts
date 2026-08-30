import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../app.js';
import { db } from '../../lib/db.js';
import argon2 from 'argon2';
import type { FastifyInstance } from 'fastify';

describe('Auth Routes Integration Tests (POST /api/v1/auth/login)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Ensure test user exists in DB
    const passwordHash = await argon2.hash('OpsPilot2026!test');
    await db.user.upsert({
      where: { username: 'testuser' },
      update: { passwordHash, role: 'SRE_OPERATOR' },
      create: {
        username: 'testuser',
        passwordHash,
        role: 'SRE_OPERATOR',
        email: 'testuser@opspilot.dev',
        name: 'Test SRE User',
      },
    });
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { username: 'testuser' } });
    await app.close();
  });

  it('POST /api/v1/auth/login — authenticates valid user and returns signed JWT token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        username: 'testuser',
        password: 'OpsPilot2026!test',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.token).toBeDefined();
    expect(typeof body.data.token).toBe('string');
    expect(body.data.user.username).toBe('testuser');
    expect(body.data.user.role).toBe('SRE_OPERATOR');
  });

  it('POST /api/v1/auth/login — returns generic 401 for wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        username: 'testuser',
        password: 'WrongPassword123!',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
    expect(body.error.message).toBe('Invalid username or password');
  });

  it('POST /api/v1/auth/login — returns generic 401 for non-existent username (prevents enumeration)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        username: 'nonexistentuser',
        password: 'AnyPassword123!',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
    expect(body.error.message).toBe('Invalid username or password');
  });
});
