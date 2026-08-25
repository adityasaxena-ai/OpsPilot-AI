import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { getConfig, resetConfig } from '@opspilot/config';
import { buildApp } from '../app.js';
import { db } from '../lib/db.js';

describe('Cross-Module Integration Test — Full Lifecycle (Governance, Drift, AI Incidents, Remediation V2, Reporting, RAG)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let adminToken: string;
  let serviceId: string;
  let governedAssetId: string;
  let monitorId: string;
  let driftEventId: string;
  let aiIncidentId: string;
  let operationalIncidentId: string;
  let optionSetId: string;
  let chosenActionId: string;

  beforeAll(async () => {
    process.env.ENABLE_GOVERNANCE_CONTROL_CENTER = 'true';
    process.env.ENABLE_DRIFT_MONITORING = 'true';
    process.env.ENABLE_AI_INCIDENT_MGMT = 'true';
    process.env.ENABLE_REMEDIATION_V2 = 'true';
    process.env.ENABLE_REPORTING = 'true';
    process.env.ENABLE_RAG = 'true';
    process.env.NODE_ENV = 'test';
    resetConfig();

    const config = getConfig();
    adminToken = jwt.sign(
      {
        sub: 'dev-incident-commander',
        name: 'Dev Incident Commander',
        roles: ['INCIDENT_COMMANDER', 'SECURITY_ADMIN', 'SRE_OPERATOR'],
        iss: 'opspilot-dev-mint',
        aud: 'opspilot-api',
      },
      config.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    app = await buildApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    // Clean up test data across all modules cleanly
    await db.auditLog.deleteMany({});
    await db.knowledgeChunk.deleteMany({});
    await db.knowledgeSource.deleteMany({});
    await db.approval.deleteMany({});
    await db.remediationBaseline.deleteMany({});
    await db.remediationAction.deleteMany({});
    await db.incidentEvent.deleteMany({});
    await db.alert.deleteMany({});
    await db.aiIncident.deleteMany({});
    await db.driftEvent.deleteMany({});
    await db.driftMonitor.deleteMany({});
    await db.governancePolicy.deleteMany({});
    await db.governedAsset.deleteMany({});
    await db.incident.deleteMany({});
    await db.simService.deleteMany({});
    await db.service.deleteMany({});
  });

  it('executes full cross-module end-to-end flow cleanly and verifies reporting data parity', async () => {
    // -----------------------------------------------------------------------
    // STEP A: Governance Module — Create a GovernedAsset and Service
    // -----------------------------------------------------------------------
    const service = await db.service.create({
      data: {
        name: 'Credit Risk Microservice',
        slug: 'credit-risk-microservice',
        description: 'Operational service hosting credit scoring model',
        tier: 'T1',
        environment: 'production',
        ownerTeam: 'Risk AI Team',
        ownerEmail: 'risk-ai@opspilot.internal',
      },
    });
    serviceId = service.id;

    await db.simService.create({
      data: {
        serviceId,
        cpuPercent: 88,
        memoryPercent: 75,
        errorRatePercent: 6.2,
        latencyP99Ms: 1250,
        isHealthy: false,
      },
    });

    const createAssetRes = await app.inject({
      method: 'POST',
      url: '/api/v1/governance/assets',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Credit Risk Prediction Model v2',
        assetType: 'MODEL',
        description: 'Production credit risk scoring model',
        ownerTeam: 'Risk AI Team',
        ownerEmail: 'risk-ai@opspilot.internal',
        purpose: 'Real-time credit decision scoring',
        systemPrompt: 'System prompt for credit risk prediction',
      },
    });

    expect(createAssetRes.statusCode).toBe(201);
    const assetBody = createAssetRes.json();
    expect(assetBody.success).toBe(true);
    governedAssetId = assetBody.data.id;
    expect(governedAssetId).toBeDefined();

    // -----------------------------------------------------------------------
    // STEP B: Drift & AI Incident Module — Create DriftMonitor, observe drift, and escalate to trigger AI Incident
    // -----------------------------------------------------------------------
    const createMonitorRes = await app.inject({
      method: 'POST',
      url: '/api/v1/drift/monitors',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        governedAssetId,
        metricName: 'prediction_confidence_distribution',
        method: 'PSI',
        baselineSnapshot: [0.4, 0.4, 0.1, 0.1],
        threshold: 0.25,
      },
    });

    expect(createMonitorRes.statusCode).toBe(201);
    const monitorBody = createMonitorRes.json();
    monitorId = monitorBody.data.id;

    // 1. Observe shifted distribution
    const observeDriftRes = await app.inject({
      method: 'POST',
      url: `/api/v1/drift/events/${monitorId}/observe`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        observedValue: [0.05, 0.05, 0.45, 0.45],
      },
    });

    expect(observeDriftRes.statusCode).toBe(200);
    const observeData = observeDriftRes.json().data;
    driftEventId = observeData.event.id;

    // 2. Escalate drift event -> triggers linked AI Incident auto-creation
    const escalateRes = await app.inject({
      method: 'POST',
      url: `/api/v1/drift/events/${driftEventId}/review`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        action: 'escalate',
        notes: 'Critical drift detected on Credit Risk Model v2',
      },
    });

    expect(escalateRes.statusCode).toBe(200);
    expect(escalateRes.json().data.state).toBe('ESCALATED');

    // Verify linked AI Incident was auto-created
    const aiIncidentsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/ai-incidents?assetId=${governedAssetId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(aiIncidentsRes.statusCode).toBe(200);
    const aiIncidentsBody = aiIncidentsRes.json();
    expect(aiIncidentsBody.data.length).toBeGreaterThan(0);
    aiIncidentId = aiIncidentsBody.data[0].id;
    expect(aiIncidentsBody.data[0].driftEventId).toBe(driftEventId);

    // -----------------------------------------------------------------------
    // STEP C: Remediation V2 Module — Propose, Approve-Verified, Execute-Verified, & Verify
    // -----------------------------------------------------------------------
    const operationalIncident = await db.incident.create({
      data: {
        title: 'High Latency & Model Drift Degradation on Credit Risk Service',
        description: 'Linked to AI Model Drift Event on Credit Risk Model v2',
        severity: 'P1',
        status: 'INVESTIGATING',
        serviceId,
        environment: 'production',
        detectedAt: new Date(),
      },
    });
    operationalIncidentId = operationalIncident.id;

    // Propose multi-option set against operational incident
    const proposeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/remediation/propose-options',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        incidentId: operationalIncidentId,
        options: [
          {
            actionType: 'RESTART_SERVICE',
            rationale: 'Option 1: Restart container nodes to flush memory and warm model weights',
            successCriteria: { metric: 'errorRatePercent', maxAcceptableValue: 1.0 },
          },
          {
            actionType: 'SCALE_SERVICE',
            rationale: 'Option 2: Scale replica pool from 4 to 8 instances',
            successCriteria: { metric: 'cpuPercent', maxAcceptableValue: 60.0 },
          },
        ],
      },
    });

    expect(proposeRes.statusCode).toBe(200);
    const proposeBody = proposeRes.json();
    optionSetId = proposeBody.data.optionSetId;
    chosenActionId = proposeBody.data.options[0].actionId;

    // Approve via NEW approve-verified endpoint from Step 1
    const approveVerifiedRes = await app.inject({
      method: 'POST',
      url: `/api/v1/remediation/${chosenActionId}/approve-verified`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(approveVerifiedRes.statusCode).toBe(200);
    expect(approveVerifiedRes.json().data.approvalStatus).toBe('APPROVED');

    // Execute with baseline via execute-verified endpoint
    const execVerifiedRes = await app.inject({
      method: 'POST',
      url: `/api/v1/remediation/${chosenActionId}/execute-verified`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(execVerifiedRes.statusCode).toBe(200);
    expect(execVerifiedRes.json().data.supersededPeerCount).toBe(1);

    // Simulate recovery in simService
    await db.simService.update({
      where: { serviceId },
      data: {
        cpuPercent: 25,
        memoryPercent: 40,
        errorRatePercent: 0.2,
        latencyP99Ms: 180,
        isHealthy: true,
      },
    });

    // Verify outcome via verify endpoint
    const verifyOutcomeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/remediation/${chosenActionId}/verify`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(verifyOutcomeRes.statusCode).toBe(200);
    expect(verifyOutcomeRes.json().data.verificationVerdict).toBe('VERIFIED_SUCCESS');

    // Confirm incident status auto-updated to RESOLVED
    const resolvedIncident = await db.incident.findUnique({ where: { id: operationalIncidentId } });
    expect(resolvedIncident?.status).toBe('RESOLVED');

    // -----------------------------------------------------------------------
    // STEP D: Reporting Module — Query Governance, Operational & Executive Reports
    // -----------------------------------------------------------------------
    const govReportRes = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/governance',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(govReportRes.statusCode).toBe(200);
    const govData = govReportRes.json().data;
    expect(govData.summary.totalAssets).toBe(1);
    expect(govData.summary.activeAiIncidents).toBe(1);

    const opsReportRes = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/operational',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(opsReportRes.statusCode).toBe(200);
    const opsData = opsReportRes.json().data;
    expect(opsData.summary.totalIncidents).toBe(1);
    expect(opsData.summary.resolvedIncidents).toBe(1);
    expect(opsData.remediation.verifiedSuccessCount).toBe(1);

    const execReportRes = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/executive',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(execReportRes.statusCode).toBe(200);
    const execData = execReportRes.json().data;

    // Verify "reports never disagree" rule strictly: executive fields must match sub-reports 100%
    expect(execData.governance.totalGovernedAssets).toBe(govData.summary.totalAssets);
    expect(execData.governance.activeAiIncidents).toBe(govData.summary.activeAiIncidents);
    expect(execData.operational.totalIncidents).toBe(opsData.summary.totalIncidents);
    expect(execData.operational.resolvedIncidents).toBe(opsData.summary.resolvedIncidents);
    expect(execData.remediation.verifiedSuccessCount).toBe(opsData.remediation.verifiedSuccessCount);

    // -----------------------------------------------------------------------
    // STEP E: RAG Module — Ingest Knowledge Source and Query Grounded Retrieval
    // -----------------------------------------------------------------------
    const ragContent = 'To resolve credit risk model inference latency degradation due to feature drift, scale worker replica pool and warm model weight cache.';
    const ingestRagRes = await app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/sources',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Credit Risk Model Drift Remediation Protocol',
        sourceType: 'RUNBOOK',
        content: ragContent,
        isPublic: true,
      },
    });

    expect(ingestRagRes.statusCode).toBe(201);
    const ragIngestBody = ingestRagRes.json();
    expect(ragIngestBody.success).toBe(true);
    expect(ragIngestBody.data.chunkCount).toBeGreaterThan(0);

    // Query grounded retrieval for the ingested runbook
    const queryRagRes = await app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/query',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        query: ragContent,
        threshold: 0.1,
      },
    });

    expect(queryRagRes.statusCode).toBe(200);
    const queryRagBody = queryRagRes.json();
    expect(queryRagBody.data.status).toBe('GROUNDED_EVIDENCE_FOUND');
    expect(queryRagBody.data.matches[0].sourceTitle).toBe('Credit Risk Model Drift Remediation Protocol');
    expect(queryRagBody.data.matches[0].similarity).toBeGreaterThan(0);
  });
});
