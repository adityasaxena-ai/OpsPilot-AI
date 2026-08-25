import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { db } from '../../lib/db.js';
import { remediationRoutes } from './remediation.routes.js';
import jwt from 'jsonwebtoken';
import { getConfig, resetConfig } from '@opspilot/config';

describe('Remediation V2 Multi-Option & Outcome Verification Integration Tests', () => {
  let app: ReturnType<typeof Fastify>;
  let devUserToken: string;
  let serviceId: string;
  let incidentId: string;

  beforeEach(async () => {
    process.env.ENABLE_REMEDIATION_V2 = 'true';
    resetConfig();

    app = Fastify();
    await app.register(remediationRoutes);
    await app.ready();

    const config = getConfig();
    devUserToken = jwt.sign(
      {
        sub: 'dev-user-admin',
        name: 'Dev Admin User',
        roles: ['INCIDENT_COMMANDER', 'SECURITY_ADMIN', 'SRE_OPERATOR'],
        iss: 'opspilot-auth',
      },
      config.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    // Cleanup test database
    await db.auditLog.deleteMany({});
    await db.approval.deleteMany({});
    await db.remediationBaseline.deleteMany({});
    await db.remediationAction.deleteMany({});
    await db.incidentEvent.deleteMany({});
    await db.alert.deleteMany({});
    await db.incident.deleteMany({});
    await db.simService.deleteMany({});
    await db.service.deleteMany({});

    // Seed service & incident
    const service = await db.service.create({
      data: {
        name: 'V2 Multi-Option Target Service',
        slug: 'v2-multi-option-target-service',
        description: 'Target service for V2 multi-option remediation testing',
        tier: 'T1',
        environment: 'production',
        ownerTeam: 'Platform SRE',
        ownerEmail: 'sre@opspilot.internal',
      },
    });
    serviceId = service.id;

    await db.simService.create({
      data: {
        serviceId,
        cpuPercent: 95,
        errorRatePercent: 8.5,
        latencyP99Ms: 1800,
        isHealthy: false,
      },
    });

    const incident = await db.incident.create({
      data: {
        title: 'Critical Outage on Target Service',
        description: 'Target service experiencing critical outage and high latency',
        severity: 'P1',
        status: 'INVESTIGATING',
        serviceId,
        environment: 'production',
        detectedAt: new Date(),
      },
    });
    incidentId = incident.id;
  });

  afterEach(async () => {
    await app.close();
    process.env.ENABLE_REMEDIATION_V2 = 'false';
    resetConfig();
  });

  it('proposes 3 options, compares via option-sets, approves & executes one, verifies losing options SUPERSEDED and outcome VERIFIED_SUCCESS', async () => {
    // 1. Propose 3 options
    const proposeRes = await app.inject({
      method: 'POST',
      url: '/propose-options',
      headers: { Authorization: `Bearer ${devUserToken}` },
      payload: {
        incidentId,
        options: [
          {
            actionType: 'RESTART_SERVICE',
            rationale: 'Option 1: Restart container pod',
            successCriteria: { metric: 'errorRatePercent', maxAcceptableValue: 1.0 },
          },
          {
            actionType: 'SCALE_SERVICE',
            rationale: 'Option 2: Scale replica pool',
            successCriteria: { metric: 'cpuPercent', maxAcceptableValue: 70 },
          },
          {
            actionType: 'CLEAR_CACHE',
            rationale: 'Option 3: Flush Redis cache namespace',
            successCriteria: { metric: 'latencyP99Ms', maxAcceptableValue: 300 },
          },
        ],
      },
    });

    expect(proposeRes.statusCode).toBe(200);
    const proposeBody = JSON.parse(proposeRes.payload);
    expect(proposeBody.success).toBe(true);
    expect(proposeBody.data.options.length).toBe(3);

    const optionSetId = proposeBody.data.optionSetId;
    const option1Id = proposeBody.data.options[0].actionId;
    const option2Id = proposeBody.data.options[1].actionId;
    const option3Id = proposeBody.data.options[2].actionId;

    // 2. Fetch side-by-side comparison via GET /option-sets/:optionSetId
    const getSetRes = await app.inject({
      method: 'GET',
      url: `/option-sets/${optionSetId}`,
      headers: { Authorization: `Bearer ${devUserToken}` },
    });

    expect(getSetRes.statusCode).toBe(200);
    const setBody = JSON.parse(getSetRes.payload);
    expect(setBody.data.options.length).toBe(3);
    expect(setBody.data.options[0].successCriteria.metric).toBe('errorRatePercent');

    // 3. Approve Option 1 via V2 approve-verified route
    const approveRes = await app.inject({
      method: 'POST',
      url: `/${option1Id}/approve-verified`,
      headers: { Authorization: `Bearer ${devUserToken}` },
    });
    expect(approveRes.statusCode).toBe(200);

    // 4. Execute Option 1 with baseline capture via POST /:id/execute-verified
    const execRes = await app.inject({
      method: 'POST',
      url: `/${option1Id}/execute-verified`,
      headers: { Authorization: `Bearer ${devUserToken}` },
    });

    expect(execRes.statusCode).toBe(200);
    const execBody = JSON.parse(execRes.payload);
    expect(execBody.data.baseline.id).toBeDefined();
    expect(execBody.data.supersededPeerCount).toBe(2);

    // Verify Option 2 & Option 3 stand down to SUPERSEDED in DB
    const opt2InDb = await db.remediationAction.findUnique({ where: { id: option2Id } });
    const opt3InDb = await db.remediationAction.findUnique({ where: { id: option3Id } });
    expect(opt2InDb?.status).toBe('SUPERSEDED');
    expect(opt3InDb?.status).toBe('SUPERSEDED');

    // Verify baseline created
    const baseline = await db.remediationBaseline.findUnique({ where: { remediationActionId: option1Id } });
    expect(baseline).toBeDefined();
    expect((baseline?.capturedMetrics as any).errorRatePercent).toBe(8.5);

    // 5. Update simService to healthy to simulate successful recovery
    await db.simService.update({
      where: { serviceId },
      data: {
        errorRatePercent: 0.1,
        latencyP99Ms: 150,
        cpuPercent: 30,
        isHealthy: true,
      },
    });

    // 6. Outcome Verification via POST /:id/verify
    const verifyRes = await app.inject({
      method: 'POST',
      url: `/${option1Id}/verify`,
      headers: { Authorization: `Bearer ${devUserToken}` },
    });

    expect(verifyRes.statusCode).toBe(200);
    const verifyBody = JSON.parse(verifyRes.payload);
    expect(verifyBody.data.verificationVerdict).toBe('VERIFIED_SUCCESS');
    expect(verifyBody.data.currentMetrics.errorRatePercent).toBe(0.1);

    // Verify incident auto-resolved in DB
    const incidentInDb = await db.incident.findUnique({ where: { id: incidentId } });
    expect(incidentInDb?.status).toBe('RESOLVED');

    // Verify AuditLog trail
    const auditLogs = await db.auditLog.findMany({ where: { incidentId } });
    expect(auditLogs.some((l) => l.action === 'PROPOSE_REMEDIATION_OPTION_SET')).toBe(true);
    expect(auditLogs.some((l) => l.action === 'EXECUTE_VERIFIED_REMEDIATION')).toBe(true);
    expect(auditLogs.some((l) => l.action === 'VERIFY_REMEDIATION_OUTCOME')).toBe(true);
  });

  it('negative test: returns 400 when attempting execute-verified on action without successCriteria', async () => {
    // Propose standard single action without successCriteria
    const proposeRes = await app.inject({
      method: 'POST',
      url: '/propose',
      headers: { Authorization: `Bearer ${devUserToken}` },
      payload: {
        incidentId,
        actionType: 'RESTART_SERVICE',
        serviceId,
      },
    });
    const actionId = JSON.parse(proposeRes.payload).data.actionId;

    // Set status to APPROVED in DB without successCriteria
    await db.remediationAction.update({
      where: { id: actionId },
      data: { status: 'APPROVED' },
    });

    // Attempt execute-verified -> expect 400 MISSING_SUCCESS_CRITERIA
    const execRes = await app.inject({
      method: 'POST',
      url: `/${actionId}/execute-verified`,
      headers: { Authorization: `Bearer ${devUserToken}` },
    });

    expect(execRes.statusCode).toBe(400);
    const execBody = JSON.parse(execRes.payload);
    expect(execBody.error.code).toBe('MISSING_SUCCESS_CRITERIA');
  });

  it('negative test: returns 400 when attempting approve-verified on action without successCriteria', async () => {
    const proposeRes = await app.inject({
      method: 'POST',
      url: '/propose',
      headers: { Authorization: `Bearer ${devUserToken}` },
      payload: {
        incidentId,
        actionType: 'RESTART_SERVICE',
        serviceId,
      },
    });
    const actionId = JSON.parse(proposeRes.payload).data.actionId;

    const approveRes = await app.inject({
      method: 'POST',
      url: `/${actionId}/approve-verified`,
      headers: { Authorization: `Bearer ${devUserToken}` },
    });

    expect(approveRes.statusCode).toBe(400);
    const body = JSON.parse(approveRes.payload);
    expect(body.error.code).toBe('INVALID_REMEDIATION_TYPE');
  });

  it('negative test: returns 400 when attempting verify on action without a baseline', async () => {
    // Propose multi-option set
    const proposeRes = await app.inject({
      method: 'POST',
      url: '/propose-options',
      headers: { Authorization: `Bearer ${devUserToken}` },
      payload: {
        incidentId,
        options: [
          {
            actionType: 'RESTART_SERVICE',
            successCriteria: { metric: 'errorRatePercent', maxAcceptableValue: 1.0 },
          },
          {
            actionType: 'SCALE_SERVICE',
            successCriteria: { metric: 'cpuPercent', maxAcceptableValue: 70 },
          },
        ],
      },
    });
    const actionId = JSON.parse(proposeRes.payload).data.options[0].actionId;

    // Attempt verify before execute-verified -> expect 400 MISSING_BASELINE
    const verifyRes = await app.inject({
      method: 'POST',
      url: `/${actionId}/verify`,
      headers: { Authorization: `Bearer ${devUserToken}` },
    });

    expect(verifyRes.statusCode).toBe(400);
    const verifyBody = JSON.parse(verifyRes.payload);
    expect(verifyBody.error.code).toBe('MISSING_BASELINE');
  });

  it('negative test: returns 400 when propose-options is given fewer than 2 options', async () => {
    const proposeRes = await app.inject({
      method: 'POST',
      url: '/propose-options',
      headers: { Authorization: `Bearer ${devUserToken}` },
      payload: {
        incidentId,
        options: [
          {
            actionType: 'RESTART_SERVICE',
            successCriteria: { metric: 'errorRatePercent', maxAcceptableValue: 1.0 },
          },
        ],
      },
    });

    expect(proposeRes.statusCode).toBe(400);
    const proposeBody = JSON.parse(proposeRes.payload);
    expect(proposeBody.error.code).toBe('INVALID_OPTIONS_COUNT');
  });
});
