import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getConfig } from '@opspilot/config';
import {
  chunkText,
  generateEmbedding,
  performGroundedRetrieval,
} from '@opspilot/ai';
import type { KnowledgeSourceType } from '@prisma/client';
import { db } from '../../lib/db.js';
import { requirePermission } from '../auth/auth.middleware.js';

export const VALID_KNOWLEDGE_SOURCE_TYPES: KnowledgeSourceType[] = [
  'RUNBOOK',
  'POLICY',
  'ARCHITECTURE_DOC',
  'INCIDENT_HISTORY',
  'GOVERNANCE_POLICY',
];

async function getValidUserId(subject: string | undefined): Promise<string | null> {
  if (!subject) return null;
  const user = await db.user.findUnique({ where: { id: subject } });
  return user ? user.id : null;
}

export async function knowledgeRoutes(app: FastifyInstance): Promise<void> {
  // Feature flag hook: 404 for all routes when ENABLE_RAG is OFF
  app.addHook('onRequest', async (_request: FastifyRequest, reply: FastifyReply) => {
    const config = getConfig();
    if (!config.ENABLE_RAG) {
      reply.status(404).send({
        message: `Route ${_request.method}:${_request.url} not found`,
        error: 'Not Found',
        statusCode: 404,
      });
    }
  });

  // POST /api/v1/knowledge/sources — Ingest a new KnowledgeSource with chunks and embeddings
  app.post<{
    Body: {
      title: string;
      sourceType: KnowledgeSourceType;
      content: string;
      isPublic?: boolean;
    };
  }>('/sources', { preHandler: requirePermission('KNOWLEDGE_MANAGE') }, async (request, reply) => {
    const { title, sourceType, content, isPublic = true } = request.body || {};

    if (!title || !sourceType || !content) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'title, sourceType, and content are required.',
        },
      });
    }

    if (!VALID_KNOWLEDGE_SOURCE_TYPES.includes(sourceType)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_SOURCE_TYPE',
          message: `Invalid sourceType '${sourceType}'. Must be one of: ${VALID_KNOWLEDGE_SOURCE_TYPES.join(', ')}.`,
        },
      });
    }

    const actorSubject = request.user?.subject || 'dev-user-admin';
    const actorDisplayName = request.user?.displayName || request.user?.subject || 'Dev Admin';
    const validUserId = await getValidUserId(actorSubject);

    // 1. Chunk content into character chunks with overlap
    const chunks = chunkText(content, { chunkSize: 500, overlap: 50 });
    if (chunks.length === 0) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'EMPTY_CONTENT',
          message: 'Provided content contains no non-empty text chunks.',
        },
      });
    }

    // 2. Generate embeddings for each chunk
    let usedEmbeddingProvider = 'mock-synthetic-768d';
    const chunksWithEmbeddings = [];

    for (const chunk of chunks) {
      const { embedding, providerName } = await generateEmbedding(chunk.content);
      usedEmbeddingProvider = providerName;
      chunksWithEmbeddings.push({
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        embedding,
      });
    }

    // 3. Store KnowledgeSource and KnowledgeChunks transactionally
    const source = await db.knowledgeSource.create({
      data: {
        title,
        sourceType,
        isPublic,
        createdById: validUserId,
        createdBySubject: actorSubject,
        chunks: {
          create: chunksWithEmbeddings,
        },
      },
      include: {
        _count: { select: { chunks: true } },
      },
    });

    // 4. Audit Log
    await db.auditLog.create({
      data: {
        actorType: 'USER',
        action: 'CREATE_KNOWLEDGE_SOURCE',
        targetType: 'knowledge_source',
        targetId: source.id,
        metadata: {
          actorSubject,
          actorDisplayName,
          title,
          sourceType,
          isPublic,
          chunkCount: source._count.chunks,
          embeddingProvider: usedEmbeddingProvider,
        },
        result: 'SUCCESS',
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: source.id,
        title: source.title,
        sourceType: source.sourceType,
        isActive: source.isActive,
        isPublic: source.isPublic,
        createdById: source.createdById,
        createdBySubject: source.createdBySubject,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
        chunkCount: source._count.chunks,
        embeddingProvider: usedEmbeddingProvider,
      },
    });
  });

  // GET /api/v1/knowledge/sources — List sources, filterable by sourceType
  app.get<{
    Querystring: { sourceType?: KnowledgeSourceType };
  }>('/sources', { preHandler: requirePermission('KNOWLEDGE_VIEW') }, async (request) => {
    const { sourceType } = request.query;

    const sources = await db.knowledgeSource.findMany({
      where: {
        isActive: true,
        ...(sourceType ? { sourceType } : {}),
      },
      include: {
        _count: { select: { chunks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: sources.map((s) => ({
        id: s.id,
        title: s.title,
        sourceType: s.sourceType,
        isActive: s.isActive,
        isPublic: s.isPublic,
        createdById: s.createdById,
        createdBySubject: s.createdBySubject,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        chunkCount: s._count.chunks,
      })),
    };
  });

  // GET /api/v1/knowledge/sources/:id — Detail including chunk metadata (without raw float vectors)
  app.get<{
    Params: { id: string };
  }>('/sources/:id', { preHandler: requirePermission('KNOWLEDGE_VIEW') }, async (request, reply) => {
    const { id } = request.params;

    const source = await db.knowledgeSource.findUnique({
      where: { id },
      include: {
        chunks: {
          select: {
            id: true,
            chunkIndex: true,
            content: true,
            createdAt: true,
          },
          orderBy: { chunkIndex: 'asc' },
        },
      },
    });

    if (!source) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'KNOWLEDGE_SOURCE_NOT_FOUND',
          message: `KnowledgeSource '${id}' not found.`,
        },
      });
    }

    return {
      success: true,
      data: {
        id: source.id,
        title: source.title,
        sourceType: source.sourceType,
        isActive: source.isActive,
        isPublic: source.isPublic,
        createdById: source.createdById,
        createdBySubject: source.createdBySubject,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
        chunkCount: source.chunks.length,
        chunks: source.chunks,
      },
    };
  });

  // POST /api/v1/knowledge/query — Grounded retrieval with mandatory abstention & provenance
  app.post<{
    Body: {
      query: string;
      threshold?: number;
      topK?: number;
    };
  }>('/query', { preHandler: requirePermission('KNOWLEDGE_VIEW') }, async (request, reply) => {
    const { query, threshold, topK } = request.body || {};

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'query parameter is required and must be a non-empty string.',
        },
      });
    }

    const userRoles = request.user?.roles || [];
    const actorSubject = request.user?.subject || 'dev-user-admin';
    const actorDisplayName = request.user?.displayName || request.user?.subject || 'Dev Admin';

    // Perform Grounded Retrieval
    const result = await performGroundedRetrieval(db, query.trim(), {
      ...(threshold !== undefined ? { threshold: Number(threshold) } : {}),
      ...(topK !== undefined ? { topK: Number(topK) } : {}),
      userRoles,
    });

    // Audit log retrieval query
    await db.auditLog.create({
      data: {
        actorType: 'USER',
        action: 'QUERY_KNOWLEDGE_BASE',
        targetType: 'knowledge_query',
        targetId: 'rag_retrieval',
        metadata: {
          actorSubject,
          actorDisplayName,
          query,
          status: result.status,
          matchCount: result.matches.length,
          thresholdUsed: result.thresholdUsed,
          embeddingProvider: result.embeddingProvider,
        },
        result: 'SUCCESS',
      },
    });

    return reply.status(200).send({
      success: true,
      data: result,
    });
  });
}
