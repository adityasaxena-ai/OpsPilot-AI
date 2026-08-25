import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { buildApp } from '../../app.js';
import { db } from '../../lib/db.js';
import { getConfig, resetConfig } from '@opspilot/config';

describe('Governance Control Center Routes Integration', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    // Enable feature flag for test environment
    process.env['ENABLE_GOVERNANCE_CONTROL_CENTER'] = 'true';
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

    // Ensure default AGENT governance policy exists for testing
    await db.governancePolicy.deleteMany({});
    await db.governancePolicy.create({
      data: {
        name: 'Agent Deployment Policy',
        description: 'Requires human approval to deploy AI Agents to APPROVED or LIVE stages',
        appliesTo: 'AGENT',
        requiresApprovalFor: ['APPROVED', 'LIVE'],
        isActive: true,
      },
    });
  });

  const cleanupGovernanceTables = async () => {
    await db.governanceApproval.deleteMany({});
    await db.governanceRiskAssessment.deleteMany({});
    await db.governedAsset.deleteMany({});
  };

  beforeEach(async () => {
    await cleanupGovernanceTables();
  });

  afterAll(async () => {
    await cleanupGovernanceTables();
    await app.close();
  });

  it('POST /api/v1/governance/assets creates a new governed asset and populates assessedBySubject', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/governance/assets',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        name: 'Test Fraud Scoring Model v1',
        assetType: 'MODEL',
        description: 'XGBoost fraud detection model for payments',
        ownerTeam: 'Risk Engineering',
        ownerEmail: 'risk@opspilot.dev',
        purpose: 'Real-time transaction fraud scoring',
        isProductionFacing: true,
        dataSensitivity: 'RESTRICTED_PII',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Test Fraud Scoring Model v1');
    expect(body.data.lifecycleStage).toBe('PROPOSED');
    expect(body.data.riskLevel).toBe('HIGH');

    // Verify detail endpoint returns assessedBySubject
    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/governance/assets/${body.data.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(detailRes.statusCode).toBe(200);
    const detailBody = detailRes.json();
    expect(detailBody.data.riskAssessments.length).toBeGreaterThan(0);
    expect(detailBody.data.riskAssessments[0].assessedBySubject).toBe('test-sec-admin');

    // Verify AuditLog metadata contains actorSubject
    const auditLogs = await db.auditLog.findMany({
      where: { targetId: body.data.id, action: 'CREATE_GOVERNED_ASSET' },
    });
    expect(auditLogs.length).toBe(1);
    expect((auditLogs[0]!.metadata as any).actorSubject).toBe('test-sec-admin');
  });

  it('POST /api/v1/governance/assets/:id/lifecycle requires approval for promotion to APPROVED stage and populates requestedBySubject', async () => {
    // 1. Create asset
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/governance/assets',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Test Customer Agent',
        assetType: 'AGENT',
        description: 'Automated support agent',
        ownerTeam: 'Customer Ops',
        ownerEmail: 'support@opspilot.dev',
        purpose: 'Triage support tickets',
      },
    });
    const assetId = createRes.json().data.id;

    // 2. Request transition to APPROVED
    const lifecycleRes = await app.inject({
      method: 'POST',
      url: `/api/v1/governance/assets/${assetId}/lifecycle`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { targetStage: 'APPROVED' },
    });

    expect(lifecycleRes.statusCode).toBe(200);
    const body = lifecycleRes.json();
    expect(body.success).toBe(true);
    expect(body.data.approvalRequired).toBe(true);
    expect(body.data.approval?.status).toBe('PENDING');
    expect(body.data.approval?.requestedBySubject).toBe('test-sec-admin');
    expect(body.data.asset.lifecycleStage).toBe('PROPOSED'); // Stage untouched while pending
  });

  it('POST /api/v1/governance/approvals/:id/approve promotes asset, populates approvedBySubject, and logs to AuditLog', async () => {
    // 1. Create asset
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/governance/assets',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Test Production Agent v2',
        assetType: 'AGENT',
        description: 'Autonomic SRE remediation agent',
        ownerTeam: 'Platform SRE',
        ownerEmail: 'sre@opspilot.dev',
        purpose: 'Automated incident triage and resolution',
      },
    });
    const assetId = createRes.json().data.id;

    // 2. Request transition to LIVE
    const lifecycleRes = await app.inject({
      method: 'POST',
      url: `/api/v1/governance/assets/${assetId}/lifecycle`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { targetStage: 'LIVE' },
    });

    const approvalId = lifecycleRes.json().data.approval.id;

    // 3. Approve via SECURITY_ADMIN
    const approveRes = await app.inject({
      method: 'POST',
      url: `/api/v1/governance/approvals/${approvalId}/approve`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(approveRes.statusCode).toBe(200);
    const body = approveRes.json();
    expect(body.success).toBe(true);
    expect(body.data.approval.status).toBe('APPROVED');
    expect(body.data.approval.approvedBySubject).toBe('test-sec-admin');
    expect(body.data.asset.lifecycleStage).toBe('LIVE');

    // 4. Verify AuditLog entry exists with metadata.actorSubject and metadata.approvedBySubject
    const auditLogs = await db.auditLog.findMany({
      where: { targetId: assetId, action: 'APPROVE_GOVERNANCE_LIFECYCLE_TRANSITION' },
    });
    expect(auditLogs.length).toBeGreaterThan(0);
    expect(auditLogs[0]?.targetType).toBe('governed_asset');
    expect((auditLogs[0]!.metadata as any).actorSubject).toBe('test-sec-admin');
  });

  it('rejects approval attempts from VIEWER role with 403 Forbidden', async () => {
    // 1. Create asset
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/governance/assets',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Test Prompt Template v2',
        assetType: 'PROMPT',
        description: 'System prompt for triage',
        ownerTeam: 'AI Engineering',
        ownerEmail: 'ai@opspilot.dev',
        purpose: 'Triage prompt',
      },
    });
    const assetId = createRes.json().data.id;

    // 2. Request transition to LIVE
    const lifecycleRes = await app.inject({
      method: 'POST',
      url: `/api/v1/governance/assets/${assetId}/lifecycle`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { targetStage: 'LIVE' },
    });
    const approvalId = lifecycleRes.json().data?.approval?.id;

    // 3. Attempt approve with VIEWER token
    const rejectRes = await app.inject({
      method: 'POST',
      url: `/api/v1/governance/approvals/${approvalId}/approve`,
      headers: { authorization: `Bearer ${viewerToken}` },
    });

    expect(rejectRes.statusCode).toBe(403);
    const body = rejectRes.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('INSUFFICIENT_PERMISSION');
  });
});
