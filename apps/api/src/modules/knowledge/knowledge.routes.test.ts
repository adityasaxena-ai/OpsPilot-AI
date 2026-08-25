import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { getConfig, resetConfig } from '@opspilot/config';
import { buildApp } from '../../app.js';
import { db } from '../../lib/db.js';

describe('Grounded Retrieval Knowledge Routes Integration Tests', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let adminToken: string;
  let viewerToken: string;
  let publicSourceId: string;
  let privateSourceId: string;

  beforeAll(async () => {
    process.env.ENABLE_RAG = 'true';
    process.env.NODE_ENV = 'test';
    resetConfig();

    const config = getConfig();
    adminToken = jwt.sign(
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
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    // Clean up test knowledge sources
    await db.knowledgeSource.deleteMany({
      where: {
        title: { startsWith: 'Test Runbook' },
      },
    });
  });

  it('POST /api/v1/knowledge/sources — ingests a public knowledge source cleanly', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/sources',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        title: 'Test Runbook Payment Gateway Recovery',
        sourceType: 'RUNBOOK',
        content: 'To recover payment gateway core service when connection pool exhausts, scale up pool max_connections to 150 and restart worker nodes.',
        isPublic: true,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Test Runbook Payment Gateway Recovery');
    expect(body.data.sourceType).toBe('RUNBOOK');
    expect(body.data.isPublic).toBe(true);
    expect(body.data.chunkCount).toBeGreaterThan(0);
    expect(body.data.embeddingProvider).toBeDefined();

    publicSourceId = body.data.id;
  });

  it('POST /api/v1/knowledge/sources — rejects ingestion without KNOWLEDGE_MANAGE permission (403)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/sources',
      headers: {
        authorization: `Bearer ${viewerToken}`,
      },
      payload: {
        title: 'Test Runbook Unauthorized',
        sourceType: 'RUNBOOK',
        content: 'Unauthorized ingestion content.',
        isPublic: true,
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it('GET /api/v1/knowledge/sources — lists sources filterable by sourceType', async () => {
    // Ingest source first
    await app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/sources',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Test Runbook DB Failover',
        sourceType: 'RUNBOOK',
        content: 'Database failover procedures for PostgreSQL replica promotion.',
        isPublic: true,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/knowledge/sources?sourceType=RUNBOOK',
      headers: { authorization: `Bearer ${viewerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].sourceType).toBe('RUNBOOK');
  });

  it('GET /api/v1/knowledge/sources/:id — returns detail with chunks without raw float vectors', async () => {
    const ingestRes = await app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/sources',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Test Runbook Detail Check',
        sourceType: 'RUNBOOK',
        content: 'Detail check content text for chunk verification.',
        isPublic: true,
      },
    });
    const sourceId = ingestRes.json().data.id;

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/knowledge/sources/${sourceId}`,
      headers: { authorization: `Bearer ${viewerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(sourceId);
    expect(Array.isArray(body.data.chunks)).toBe(true);
    expect(body.data.chunks[0].content).toBeDefined();
    expect(body.data.chunks[0].embedding).toBeUndefined(); // Raw float array omitted for client UI safety
  });

  it('POST /api/v1/knowledge/query — returns grounded matches with full provenance', async () => {
    // Ingest a runbook
    await app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/sources',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Test Runbook Payment Gateway Recovery',
        sourceType: 'RUNBOOK',
        content: 'To recover payment gateway core service when connection pool exhausts, scale up pool max_connections to 150 and restart worker nodes.',
        isPublic: true,
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/query',
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: {
        query: 'To recover payment gateway core service when connection pool exhausts',
        threshold: 0.1,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('GROUNDED_EVIDENCE_FOUND');
    expect(body.data.matches.length).toBeGreaterThan(0);
    expect(body.data.matches[0].sourceTitle).toBe('Test Runbook Payment Gateway Recovery');
    expect(body.data.matches[0].similarity).toBeGreaterThan(0);
  });

  it('POST /api/v1/knowledge/query — abstains when similarity is below threshold', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/sources',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Test Runbook Payment Gateway Recovery',
        sourceType: 'RUNBOOK',
        content: 'To recover payment gateway core service when connection pool exhausts.',
        isPublic: true,
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/query',
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: {
        query: 'completely unrelated query string xyz',
        threshold: 0.9999, // Unreachable threshold
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(body.data.matches).toEqual([]);
    expect(body.data.explanation).toContain('zero knowledge chunks cleared similarity threshold');
  });

  it('POST /api/v1/knowledge/query — enforces access control for non-public sources', async () => {
    // Ingest a restricted (non-public) source
    const secretContent = 'Confidential administrative credentials reset procedure for security emergency response.';
    const ingestRes = await app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/sources',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        title: 'Test Runbook Confidential Security Protocol',
        sourceType: 'POLICY',
        content: secretContent,
        isPublic: false, // Restricted source
      },
    });
    privateSourceId = ingestRes.json().data.id;

    // 1. Viewer query (no SECURITY_ADMIN or INCIDENT_COMMANDER role) -> Expect abstention/exclusion
    const viewerQueryRes = await app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/query',
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: {
        query: secretContent,
        threshold: 0.1,
      },
    });
    expect(viewerQueryRes.statusCode).toBe(200);
    const viewerBody = viewerQueryRes.json();
    expect(viewerBody.data.status).toBe('INSUFFICIENT_EVIDENCE');

    // 2. Admin query (SECURITY_ADMIN role) -> Expect grounded evidence found
    const adminQueryRes = await app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/query',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        query: secretContent,
        threshold: 0.1,
      },
    });
    expect(adminQueryRes.statusCode).toBe(200);
    const adminBody = adminQueryRes.json();
    expect(adminBody.data.status).toBe('GROUNDED_EVIDENCE_FOUND');
    expect(adminBody.data.matches[0].sourceTitle).toBe('Test Runbook Confidential Security Protocol');
  });

  it('returns 404 for knowledge routes when ENABLE_RAG flag is OFF', async () => {
    process.env.ENABLE_RAG = 'false';
    resetConfig();

    const flagOffApp = await buildApp();
    try {
      const res = await flagOffApp.inject({
        method: 'GET',
        url: '/api/v1/knowledge/sources',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await flagOffApp.close();
      process.env.ENABLE_RAG = 'true';
      resetConfig();
    }
  });
});
