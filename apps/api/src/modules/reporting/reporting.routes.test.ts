import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { buildApp } from '../../app.js';
import { db } from '../../lib/db.js';
import { getConfig, resetConfig } from '@opspilot/config';

describe('Reporting Aggregation Routes Integration', () => {
  let app: FastifyInstance;
  let viewerToken: string;
  let sreToken: string;
  let commanderToken: string;
  let adminToken: string;

  beforeAll(async () => {
    // Enable feature flags for testing
    process.env['ENABLE_GOVERNANCE_CONTROL_CENTER'] = 'true';
    process.env['ENABLE_DRIFT_MONITORING'] = 'true';
    process.env['ENABLE_AI_INCIDENT_MGMT'] = 'true';
    process.env['ENABLE_REPORTING'] = 'true';
    resetConfig();
    const config = getConfig();

    viewerToken = jwt.sign(
      { sub: 'test-viewer', roles: ['VIEWER'], iss: 'opspilot-auth' },
      config.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    sreToken = jwt.sign(
      { sub: 'test-sre', roles: ['SRE_OPERATOR'], iss: 'opspilot-auth' },
      config.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    commanderToken = jwt.sign(
      { sub: 'test-commander', roles: ['INCIDENT_COMMANDER'], iss: 'opspilot-auth' },
      config.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    adminToken = jwt.sign(
      { sub: 'test-admin', roles: ['SECURITY_ADMIN'], iss: 'opspilot-auth' },
      config.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    app = await buildApp();
    await app.ready();
  });

  const cleanupTables = async () => {
    await db.auditLog.deleteMany({});
    await db.governedAsset.deleteMany({});
    await db.approval.deleteMany({});
    await db.remediationBaseline.deleteMany({});
    await db.remediationAction.deleteMany({});
    await db.incident.deleteMany({});
    await db.service.deleteMany({});
  };

  beforeEach(async () => {
    await cleanupTables();
  });

  afterAll(async () => {
    await cleanupTables();
    await app.close();
  });

  it('GET /api/v1/reports/operational returns 200 for all 4 roles', async () => {
    const roles = [viewerToken, sreToken, commanderToken, adminToken];

    for (const token of roles) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/reports/operational?days=14',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.timeWindowDays).toBe(14);
      expect(data.incidentCounts).toBeDefined();
    }
  });

  it('GET /api/v1/reports/governance returns 200 for all 4 roles', async () => {
    const roles = [viewerToken, sreToken, commanderToken, adminToken];

    for (const token of roles) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/reports/governance',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.assetInventory).toBeDefined();
    }
  });

  it('GET /api/v1/reports/executive returns 200 for all 4 roles', async () => {
    const roles = [viewerToken, sreToken, commanderToken, adminToken];

    for (const token of roles) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/reports/executive?days=30',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.operationalPosture).toBeDefined();
      expect(data.remediationEffectiveness).toBeDefined();
    }
  });
});
