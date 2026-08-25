import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { buildApp } from '../../app.js';
import { db } from '../../lib/db.js';
import { getConfig, resetConfig } from '@opspilot/config';

describe('AI Incident Management Routes Integration', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let viewerToken: string;

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

  const cleanupIncidentTables = async () => {
    await db.aiIncidentTimelineEntry.deleteMany({});
    await db.aiIncident.deleteMany({});
  };

  beforeEach(async () => {
    await cleanupIncidentTables();
  });

  afterAll(async () => {
    await cleanupIncidentTables();
    await app.close();
  });

  it('POST /api/v1/ai-incidents creates a new AI incident and initial timeline entry with actorSubject', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai-incidents',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        incidentType: 'HARMFUL_OUTPUT',
        title: 'Hallucinatory response in customer chatbot',
        description: 'Chatbot provided incorrect pricing information to user',
        severity: 'P2',
      },
    });

    expect(res.statusCode).toBe(201);
    const incident = res.json().data;
    expect(incident.title).toBe('Hallucinatory response in customer chatbot');
    expect(incident.status).toBe('DETECTED');

    // Query detail view to verify timeline entry and actorSubject
    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/ai-incidents/${incident.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(detailRes.statusCode).toBe(200);
    const detail = detailRes.json().data;
    expect(detail.timelineEntries.length).toBe(1);
    expect(detail.timelineEntries[0].actorSubject).toBe('test-sec-admin');
  });

  it('POST /api/v1/ai-incidents/:id/timeline adds timeline entry and captures actorSubject', async () => {
    // 1. Create incident
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/ai-incidents',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        incidentType: 'UNEXPECTED_BEHAVIOR',
        title: 'Unexpected confidence drop in triage agent',
        description: 'Triage agent confidence dropped to 12%',
        severity: 'P3',
      },
    });
    const incidentId = createRes.json().data.id;

    // 2. Add timeline entry
    const timelineRes = await app.inject({
      method: 'POST',
      url: `/api/v1/ai-incidents/${incidentId}/timeline`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        entryType: 'INVESTIGATION',
        description: 'Inspected prompt context and vector database embeddings',
        metadata: { vectorDbStatus: 'OK' },
      },
    });

    expect(timelineRes.statusCode).toBe(201);
    const entry = timelineRes.json().data;
    expect(entry.entryType).toBe('INVESTIGATION');
    expect(entry.actorSubject).toBe('test-sec-admin');
  });

  it('POST /api/v1/ai-incidents/:id/status transitions status according to allowed matrix and rejects invalid transitions', async () => {
    // 1. Create incident (status: DETECTED)
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/ai-incidents',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        incidentType: 'POLICY_VIOLATION',
        title: 'Prompt injection attempt detected',
        description: 'User prompt tried to bypass safety guardrails',
        severity: 'P2',
      },
    });
    const incidentId = createRes.json().data.id;

    // 2. Invalid transition: DETECTED -> REMEDIATION_IN_PROGRESS should fail 400
    const invalidRes = await app.inject({
      method: 'POST',
      url: `/api/v1/ai-incidents/${incidentId}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { targetStatus: 'REMEDIATION_IN_PROGRESS' },
    });
    expect(invalidRes.statusCode).toBe(400);
    expect(invalidRes.json().error.code).toBe('INVALID_STATUS_TRANSITION');

    // 3. Valid transition: DETECTED -> TRIAGED
    const triagedRes = await app.inject({
      method: 'POST',
      url: `/api/v1/ai-incidents/${incidentId}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { targetStatus: 'TRIAGED', notes: 'Assigned to Security SRE team' },
    });
    expect(triagedRes.statusCode).toBe(200);
    expect(triagedRes.json().data.status).toBe('TRIAGED');
  });

  it('rejects status transition attempts from VIEWER role with 403 Forbidden', async () => {
    // 1. Create incident
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/ai-incidents',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        incidentType: 'DATA_ISSUE',
        title: 'Stale knowledge source in RAG database',
        description: 'Vector store contains outdated runbook chunks',
        severity: 'P4',
      },
    });
    const incidentId = createRes.json().data.id;

    // 2. Attempt status transition as VIEWER
    const rejectRes = await app.inject({
      method: 'POST',
      url: `/api/v1/ai-incidents/${incidentId}/status`,
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { targetStatus: 'TRIAGED' },
    });

    expect(rejectRes.statusCode).toBe(403);
    expect(rejectRes.json().error.code).toBe('INSUFFICIENT_PERMISSION');
  });
});
