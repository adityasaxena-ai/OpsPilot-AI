import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { getConfig, resetConfig } from '@opspilot/config';
import { buildApp } from '../../app.js';
import { db } from '../../lib/db.js';

describe('Predictive Intelligence Routes Integration Tests', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let devAdminToken: string;
  let viewerToken: string;
  let testServiceId: string;

  beforeAll(async () => {
    process.env.ENABLE_PREDICTIVE_INTELLIGENCE = 'true';
    process.env.NODE_ENV = 'test';
    resetConfig();

    const config = getConfig();
    devAdminToken = jwt.sign(
      {
        sub: 'test-admin-user',
        name: 'Dev Admin',
        roles: ['SECURITY_ADMIN', 'SRE_OPERATOR'],
        iss: 'opspilot-dev-mint',
        aud: 'opspilot-api',
      },
      config.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    viewerToken = jwt.sign(
      {
        sub: 'test-viewer-user',
        name: 'Dev Viewer',
        roles: ['VIEWER'],
        iss: 'opspilot-dev-mint',
        aud: 'opspilot-api',
      },
      config.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await cleanupTables();
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTables();

    // Create a clean test Service
    const service = await db.service.create({
      data: {
        name: 'Payment Processing Service',
        slug: `payment-service-${Date.now()}`,
        description: 'Handles payment transactions',
        tier: 'T1',
        environment: 'production',
        ownerTeam: 'payments',
        ownerEmail: 'payments@opspilot.io',
      },
    });
    testServiceId = service.id;
  });

  async function cleanupTables() {
    await db.prediction.deleteMany();
    await db.predictionMonitor.deleteMany();
    await db.service.deleteMany({ where: { slug: { startsWith: 'payment-service-' } } });
  }

  it('POST /api/v1/predictions/monitors creates a new PredictionMonitor for a valid service and metric', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/predictions/monitors',
      headers: { Authorization: `Bearer ${devAdminToken}` },
      payload: {
        serviceId: testServiceId,
        metricName: 'cpuPercent',
        threshold: 85,
        horizonMinutes: 30,
        minimumSamples: 5,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.id).toBeDefined();
    expect(body.data.metricName).toBe('cpuPercent');
    expect(body.data.threshold).toBe(85);
    expect(body.data.horizonMinutes).toBe(30);
  });

  it('POST /api/v1/predictions/monitors/:id/evaluate evaluates rising trend and creates an ACTIVE Prediction with confidence and horizon in explanation', async () => {
    // 1. Create monitor
    const monitorRes = await app.inject({
      method: 'POST',
      url: '/api/v1/predictions/monitors',
      headers: { Authorization: `Bearer ${devAdminToken}` },
      payload: {
        serviceId: testServiceId,
        metricName: 'cpuPercent',
        threshold: 80,
        horizonMinutes: 30,
        minimumSamples: 5,
      },
    });
    const monitorId = JSON.parse(monitorRes.payload).data.id;

    // 2. Evaluate with 8 samples (rising CPU trend)
    const now = Date.now();
    const samples = Array.from({ length: 8 }, (_, i) => ({
      timestamp: now + i * 60000,
      value: 30 + i * 5, // 30, 35, 40, ... 65
    }));

    const evalRes = await app.inject({
      method: 'POST',
      url: `/api/v1/predictions/monitors/${monitorId}/evaluate`,
      headers: { Authorization: `Bearer ${devAdminToken}` },
      payload: { samples },
    });

    expect(evalRes.statusCode).toBe(200);
    const evalBody = JSON.parse(evalRes.payload);
    expect(evalBody.success).toBe(true);

    const prediction = evalBody.data;
    expect(prediction.status).toBe('ACTIVE');
    expect(prediction.projectedValue).toBeGreaterThan(80);
    expect(prediction.confidence).toBeGreaterThan(0);
    expect(prediction.evidenceSamples).toHaveLength(8);

    // Non-hallucination requirement: explanation must contain confidence figure & horizon!
    expect(prediction.explanation).toContain('confidence');
    expect(prediction.explanation).toContain('30 minutes');
    expect(prediction.explanation).toContain('cpuPercent');
  });

  it('POST /api/v1/predictions/monitors/:id/evaluate returns INSUFFICIENT_EVIDENCE when fewer samples than minimumSamples are provided', async () => {
    const monitorRes = await app.inject({
      method: 'POST',
      url: '/api/v1/predictions/monitors',
      headers: { Authorization: `Bearer ${devAdminToken}` },
      payload: {
        serviceId: testServiceId,
        metricName: 'latencyP99Ms',
        threshold: 500,
        horizonMinutes: 15,
        minimumSamples: 5,
      },
    });
    const monitorId = JSON.parse(monitorRes.payload).data.id;

    // 3 samples (min is 5)
    const now = Date.now();
    const samples = [
      { timestamp: now, value: 100 },
      { timestamp: now + 60000, value: 150 },
      { timestamp: now + 120000, value: 200 },
    ];

    const evalRes = await app.inject({
      method: 'POST',
      url: `/api/v1/predictions/monitors/${monitorId}/evaluate`,
      headers: { Authorization: `Bearer ${devAdminToken}` },
      payload: { samples },
    });

    expect(evalRes.statusCode).toBe(200);
    const evalBody = JSON.parse(evalRes.payload);
    expect(evalBody.data.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(evalBody.data.projectedValue).toBeNull();
    expect(evalBody.data.confidence).toBe(0);
    expect(evalBody.data.explanation).toContain('Insufficient evidence: received 3 sample(s)');
  });

  it('GET /api/v1/predictions and GET /api/v1/predictions/:id return predictions with evidenceSamples', async () => {
    const monitorRes = await app.inject({
      method: 'POST',
      url: '/api/v1/predictions/monitors',
      headers: { Authorization: `Bearer ${devAdminToken}` },
      payload: {
        serviceId: testServiceId,
        metricName: 'errorRatePercent',
        threshold: 2.0,
        horizonMinutes: 20,
        minimumSamples: 5,
      },
    });
    const monitorId = JSON.parse(monitorRes.payload).data.id;

    const now = Date.now();
    const samples = Array.from({ length: 6 }, (_, i) => ({
      timestamp: now + i * 60000,
      value: 0.1 + i * 0.4,
    }));

    const evalRes = await app.inject({
      method: 'POST',
      url: `/api/v1/predictions/monitors/${monitorId}/evaluate`,
      headers: { Authorization: `Bearer ${devAdminToken}` },
      payload: { samples },
    });
    const predictionId = JSON.parse(evalRes.payload).data.id;

    // GET /predictions list
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/predictions?serviceId=${testServiceId}`,
      headers: { Authorization: `Bearer ${devAdminToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.payload);
    expect(listBody.data).toHaveLength(1);

    // GET /predictions/:id detail
    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/predictions/${predictionId}`,
      headers: { Authorization: `Bearer ${devAdminToken}` },
    });
    expect(detailRes.statusCode).toBe(200);
    const detailBody = JSON.parse(detailRes.payload);
    expect(detailBody.data.id).toBe(predictionId);
    expect(detailBody.data.evidenceSamples).toHaveLength(6);
  });

  it('POST /api/v1/predictions/:id/review allows human operator to record review notes', async () => {
    const monitorRes = await app.inject({
      method: 'POST',
      url: '/api/v1/predictions/monitors',
      headers: { Authorization: `Bearer ${devAdminToken}` },
      payload: {
        serviceId: testServiceId,
        metricName: 'queueDepth',
        threshold: 50,
        horizonMinutes: 15,
        minimumSamples: 5,
      },
    });
    const monitorId = JSON.parse(monitorRes.payload).data.id;

    const now = Date.now();
    const samples = Array.from({ length: 5 }, (_, i) => ({
      timestamp: now + i * 60000,
      value: 5 + i * 5,
    }));

    const evalRes = await app.inject({
      method: 'POST',
      url: `/api/v1/predictions/monitors/${monitorId}/evaluate`,
      headers: { Authorization: `Bearer ${devAdminToken}` },
      payload: { samples },
    });
    const predictionId = JSON.parse(evalRes.payload).data.id;

    const reviewRes = await app.inject({
      method: 'POST',
      url: `/api/v1/predictions/${predictionId}/review`,
      headers: { Authorization: `Bearer ${devAdminToken}` },
      payload: { notes: 'Acknowledged rising queue backlog.' },
    });

    expect(reviewRes.statusCode).toBe(200);
    const reviewBody = JSON.parse(reviewRes.payload);
    expect(reviewBody.data.reviewedBySubject).toBe('test-admin-user');
    expect(reviewBody.data.reviewNotes).toBe('Acknowledged rising queue backlog.');
  });

  it('returns 403 INSUFFICIENT_PERMISSION when VIEWER attempts to create a prediction monitor', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/predictions/monitors',
      headers: { Authorization: `Bearer ${viewerToken}` },
      payload: {
        serviceId: testServiceId,
        metricName: 'cpuPercent',
        threshold: 90,
        horizonMinutes: 30,
      },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('INSUFFICIENT_PERMISSION');
  });

  it('returns 400 INVALID_METRIC when attempting to create a monitor for an unsupported metric', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/predictions/monitors',
      headers: { Authorization: `Bearer ${devAdminToken}` },
      payload: {
        serviceId: testServiceId,
        metricName: 'unsupportedCustomMetric',
        threshold: 100,
        horizonMinutes: 30,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('INVALID_METRIC');
  });
});
