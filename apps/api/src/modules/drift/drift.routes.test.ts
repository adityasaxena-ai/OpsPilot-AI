import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { buildApp } from '../../app.js';
import { db } from '../../lib/db.js';
import { getConfig, resetConfig } from '@opspilot/config';

describe('Model Drift Detection Routes Integration', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let viewerToken: string;
  let assetId: string;

  beforeAll(async () => {
    // Enable feature flags for testing
    process.env['ENABLE_GOVERNANCE_CONTROL_CENTER'] = 'true';
    process.env['ENABLE_DRIFT_MONITORING'] = 'true';
    process.env['ENABLE_AI_INCIDENT_MGMT'] = 'true';
    resetConfig();
    const config = getConfig();

    // Mint signed JWTs for testing
    adminToken = jwt.sign(
      {
        sub: 'test-sec-admin',
        name: 'Security Admin',
        roles: ['SECURITY_ADMIN'],
        iss: 'opspilot-auth',
      },
      config.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    viewerToken = jwt.sign(
      {
        sub: 'test-viewer',
        name: 'Readonly Viewer',
        roles: ['VIEWER'],
        iss: 'opspilot-auth',
      },
      config.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    app = await buildApp();
    await app.ready();
  });

  const cleanupDriftTables = async () => {
    await db.aiIncidentTimelineEntry.deleteMany({});
    await db.aiIncident.deleteMany({});
    await db.driftEvent.deleteMany({});
    await db.driftMonitor.deleteMany({});
    await db.governedAsset.deleteMany({});
  };

  beforeEach(async () => {
    await cleanupDriftTables();

    // Create a base GovernedAsset for drift monitoring tests
    const asset = await db.governedAsset.create({
      data: {
        name: 'Test Payment Classifier v2',
        assetType: 'MODEL',
        description: 'Payment fraud scoring model',
        ownerTeam: 'Risk Platform',
        ownerEmail: 'risk@opspilot.dev',
        purpose: 'Real-time payment triage',
        lifecycleStage: 'LIVE',
        riskLevel: 'HIGH',
      },
    });
    assetId = asset.id;
  });

  afterAll(async () => {
    await cleanupDriftTables();
    await app.close();
  });

  it('POST /api/v1/drift/monitors creates a monitor and POST /events/:id/observe triggers DRIFT_DETECTED', async () => {
    // 1. Create a PSI drift monitor
    const monitorRes = await app.inject({
      method: 'POST',
      url: '/api/v1/drift/monitors',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        governedAssetId: assetId,
        metricName: 'prediction_confidence_distribution',
        method: 'PSI',
        baselineSnapshot: [0.4, 0.4, 0.1, 0.1],
        threshold: 0.25,
      },
    });

    expect(monitorRes.statusCode).toBe(201);
    const monitor = monitorRes.json().data;
    expect(monitor.metricName).toBe('prediction_confidence_distribution');

    // 2. Observe a shifted probability distribution
    const observeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/drift/events/${monitor.id}/observe`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        observedValue: [0.05, 0.05, 0.45, 0.45],
      },
    });

    expect(observeRes.statusCode).toBe(200);
    const observeData = observeRes.json().data;
    expect(observeData.event.state).toBe('DRIFT_DETECTED');
    expect(observeData.event.computedScore).toBeGreaterThanOrEqual(0.25);
  });

  it('reviews drift event through acknowledge -> begin_validation -> resolve and populates reviewedBySubject', async () => {
    // 1. Create monitor and trigger drift
    const monitorRes = await app.inject({
      method: 'POST',
      url: '/api/v1/drift/monitors',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        governedAssetId: assetId,
        metricName: 'error_rate',
        method: 'ERROR_RATE_COMPARISON',
        baselineSnapshot: 0.01,
        threshold: 0.05,
      },
    });
    const monitorId = monitorRes.json().data.id;

    const observeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/drift/events/${monitorId}/observe`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { observedValue: 0.08 },
    });
    const eventId = observeRes.json().data.event.id;

    // 2. Acknowledge (DRIFT_DETECTED -> UNDER_REVIEW)
    const ackRes = await app.inject({
      method: 'POST',
      url: `/api/v1/drift/events/${eventId}/review`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: 'acknowledge', notes: 'Under investigation by SRE' },
    });
    expect(ackRes.statusCode).toBe(200);
    expect(ackRes.json().data.event.state).toBe('UNDER_REVIEW');
    expect(ackRes.json().data.event.reviewedBySubject).toBe('test-sec-admin');

    // 3. Begin Validation (UNDER_REVIEW -> VALIDATION_REMEDIATION)
    const valRes = await app.inject({
      method: 'POST',
      url: `/api/v1/drift/events/${eventId}/review`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: 'begin_validation', notes: 'Running retraining validation' },
    });
    expect(valRes.statusCode).toBe(200);
    expect(valRes.json().data.event.state).toBe('VALIDATION_REMEDIATION');

    // 4. Resolve (VALIDATION_REMEDIATION -> RESOLVED)
    const resRes = await app.inject({
      method: 'POST',
      url: `/api/v1/drift/events/${eventId}/review`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: 'resolve', notes: 'Model recalibrated successfully' },
    });
    expect(resRes.statusCode).toBe(200);
    expect(resRes.json().data.event.state).toBe('RESOLVED');
    expect(resRes.json().data.event.resolvedAt).not.toBeNull();
  });

  it('escalating a drift event auto-creates a linked AiIncident', async () => {
    // 1. Create monitor and trigger drift
    const monitorRes = await app.inject({
      method: 'POST',
      url: '/api/v1/drift/monitors',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        governedAssetId: assetId,
        metricName: 'prediction_confidence_distribution',
        method: 'PSI',
        baselineSnapshot: [0.4, 0.4, 0.1, 0.1],
        threshold: 0.25,
      },
    });
    const monitorId = monitorRes.json().data.id;

    const observeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/drift/events/${monitorId}/observe`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { observedValue: [0.05, 0.05, 0.45, 0.45] },
    });
    const eventId = observeRes.json().data.event.id;

    // 2. Escalate drift event
    const escRes = await app.inject({
      method: 'POST',
      url: `/api/v1/drift/events/${eventId}/review`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { action: 'escalate', notes: 'Critical model performance loss' },
    });

    expect(escRes.statusCode).toBe(200);
    const body = escRes.json();
    expect(body.data.event.state).toBe('ESCALATED');
    expect(body.data.createdAiIncident).not.toBeNull();
    expect(body.data.createdAiIncident.incidentType).toBe('MODEL_DRIFT');
    expect(body.data.createdAiIncident.driftEventId).toBe(eventId);
  });

  it('rejects review attempts from VIEWER role with 403 Forbidden', async () => {
    // 1. Create monitor and trigger drift
    const monitorRes = await app.inject({
      method: 'POST',
      url: '/api/v1/drift/monitors',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        governedAssetId: assetId,
        metricName: 'error_rate',
        method: 'ERROR_RATE_COMPARISON',
        baselineSnapshot: 0.01,
        threshold: 0.05,
      },
    });
    const monitorId = monitorRes.json().data.id;

    const observeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/drift/events/${monitorId}/observe`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { observedValue: 0.08 },
    });
    const eventId = observeRes.json().data.event.id;

    // 2. Attempt review as VIEWER
    const rejectRes = await app.inject({
      method: 'POST',
      url: `/api/v1/drift/events/${eventId}/review`,
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { action: 'acknowledge' },
    });

    expect(rejectRes.statusCode).toBe(403);
    expect(rejectRes.json().error.code).toBe('INSUFFICIENT_PERMISSION');
  });
});
