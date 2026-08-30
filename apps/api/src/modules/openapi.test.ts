import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';

describe('OpenAPI Specification Endpoint', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves OpenAPI 3.0 specification at GET /documentation/json', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/documentation/json',
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.openapi).toMatch(/^3\./);
    expect(json.info.title).toBe('OpsPilot AI Control Tower API');
    expect(json.components.securitySchemes.bearerAuth).toBeDefined();
    expect(json.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
    expect(json.paths['/api/v1/auth/login']).toBeDefined();
    expect(json.paths['/api/v1/ai/triage']).toBeDefined();
  });

  it('serves Swagger UI HTML documentation at GET /documentation', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/documentation',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });
});
