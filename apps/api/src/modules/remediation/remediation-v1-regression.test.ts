import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { db } from '../../lib/db.js';
import { remediationRoutes } from './remediation.routes.js';
import jwt from 'jsonwebtoken';
import { getConfig, resetConfig } from '@opspilot/config';

describe('Remediation V1 Regression Protection Suite', () => {
  let app: ReturnType<typeof Fastify>;
  let devUserToken: string;
  let serviceId: string;
  let incidentId: string;

  beforeEach(async () => {
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
        name: 'V1 Regression Core Service',
        slug: 'v1-regression-core-service',
        description: 'Core service for V1 remediation regression testing',
        tier: 'T1',
        environment: 'staging',
        ownerTeam: 'Platform SRE',
        ownerEmail: 'sre@opspilot.internal',
      },
    });
    serviceId = service.id;

    await db.simService.create({
      data: {
        serviceId,
        cpuPercent: 90,
        errorRatePercent: 5.0,
        latencyP99Ms: 1200,
        isHealthy: false,
      },
    });

    const incident = await db.incident.create({
      data: {
        title: 'High Error Rate in Core Service',
        description: 'Core service experiencing elevated 5xx error rates',
        severity: 'P1',
        status: 'INVESTIGATING',
        serviceId,
        environment: 'staging',
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

  for (const flagValue of [false, true]) {
    describe(`With ENABLE_REMEDIATION_V2 = ${flagValue}`, () => {
      beforeEach(() => {
        process.env.ENABLE_REMEDIATION_V2 = String(flagValue);
        resetConfig();
      });

      it('executes full V1 single-action lifecycle: propose -> approve -> execute', async () => {
        // 1. Propose single action
        const proposeRes = await app.inject({
          method: 'POST',
          url: '/propose',
          headers: { Authorization: `Bearer ${devUserToken}` },
          payload: {
            incidentId,
            actionType: 'RESTART_SERVICE',
            serviceId,
            rationale: 'V1 single action proposal test',
          },
        });

        expect(proposeRes.statusCode).toBe(200);
        const proposeBody = JSON.parse(proposeRes.payload);
        expect(proposeBody.success).toBe(true);
        expect(proposeBody.data.actionId).toBeDefined();

        const actionId = proposeBody.data.actionId;

        // Verify action created in DB with status AWAITING_APPROVAL or APPROVED
        const actionInDb = await db.remediationAction.findUnique({ where: { id: actionId } });
        expect(actionInDb).toBeDefined();
        expect(actionInDb?.actionType).toBe('RESTART_SERVICE');
        expect(actionInDb?.remediationOptionSetId).toBeNull();
        expect(actionInDb?.successCriteria).toBeNull();

        // 2. Approve action
        const approveRes = await app.inject({
          method: 'POST',
          url: `/${actionId}/approve`,
          headers: { Authorization: `Bearer ${devUserToken}` },
        });

        expect(approveRes.statusCode).toBe(200);
        const approveBody = JSON.parse(approveRes.payload);
        expect(approveBody.success).toBe(true);
        expect(approveBody.data.approvalStatus).toBe('APPROVED');
        expect(approveBody.data.execution.success).toBe(true);
      });

      it('executes V1 single-action rejection flow: propose -> reject', async () => {
        // Create an incident for rejection test
        const rejIncident = await db.incident.create({
          data: {
            title: 'Latency Spike Service B',
            description: 'Service experiencing latency spikes',
            severity: 'P2',
            status: 'INVESTIGATING',
            serviceId,
            environment: 'staging',
            detectedAt: new Date(),
          },
        });

        const proposeRes = await app.inject({
          method: 'POST',
          url: '/propose',
          headers: { Authorization: `Bearer ${devUserToken}` },
          payload: {
            incidentId: rejIncident.id,
            actionType: 'SCALE_SERVICE',
            serviceId,
            rationale: 'Single proposal to be rejected',
          },
        });

        expect(proposeRes.statusCode).toBe(200);
        const actionId = JSON.parse(proposeRes.payload).data.actionId;

        const rejectRes = await app.inject({
          method: 'POST',
          url: `/${actionId}/reject`,
          headers: { Authorization: `Bearer ${devUserToken}` },
          payload: { reason: 'Deemed unnecessary by SRE operator' },
        });

        expect(rejectRes.statusCode).toBe(200);
        const rejectBody = JSON.parse(rejectRes.payload);
        expect(rejectBody.success).toBe(true);
        expect(rejectBody.data.approvalStatus).toBe('REJECTED');

        const updatedAction = await db.remediationAction.findUnique({ where: { id: actionId } });
        expect(updatedAction?.status).toBe('REJECTED');
      });
    });
  }
});
