import type { PrismaClient, KnowledgeSourceType } from '@prisma/client';
import { generateEmbedding } from './embedding-provider.js';
import { cosineSimilarity } from './similarity.js';

export const RESTRICTED_RAG_ROLES = ['SECURITY_ADMIN', 'INCIDENT_COMMANDER'] as const;

export interface RetrievalMatch {
  chunkId: string;
  knowledgeSourceId: string;
  sourceTitle: string;
  sourceType: KnowledgeSourceType;
  chunkIndex: number;
  content: string;
  similarity: number;
  isPublic: boolean;
}

export interface RetrievalResult {
  status: 'GROUNDED_EVIDENCE_FOUND' | 'INSUFFICIENT_EVIDENCE';
  query: string;
  thresholdUsed: number;
  embeddingProvider: string;
  matches: RetrievalMatch[];
  explanation: string;
}

export interface RetrievalOptions {
  threshold?: number;
  topK?: number;
  userRoles?: string[];
}

/**
 * Core RAG Retrieval function with mandatory abstention and access control.
 *
 * NOTE: Both document ingestion and query embedding MUST use the same embedding
 * provider space; mismatched embedding spaces would yield meaningless similarity scores.
 */
export async function performGroundedRetrieval(
  prisma: PrismaClient,
  query: string,
  options: RetrievalOptions = {}
): Promise<RetrievalResult> {
  const threshold = options.threshold ?? 0.4;
  const topK = options.topK ?? 5;
  const userRoles = options.userRoles || [];

  const canAccessRestricted = userRoles.some((role) =>
    (RESTRICTED_RAG_ROLES as readonly string[]).includes(role)
  );

  // 1. Access control filter applied directly at the database query level
  const chunks = await prisma.knowledgeChunk.findMany({
    where: {
      knowledgeSource: {
        isActive: true,
        ...(canAccessRestricted ? {} : { isPublic: true }),
      },
    },
    include: {
      knowledgeSource: {
        select: {
          id: true,
          title: true,
          sourceType: true,
          isPublic: true,
        },
      },
    },
  });

  if (chunks.length === 0) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      query,
      thresholdUsed: threshold,
      embeddingProvider: 'none',
      matches: [],
      explanation: 'No accessible active knowledge sources available in database.',
    };
  }

  // 2. Embed the query
  const { embedding: queryEmbedding, providerName } = await generateEmbedding(query);

  // 3. Compute cosine similarity against all candidate chunks
  const scoredMatches: RetrievalMatch[] = [];

  for (const chunk of chunks) {
    const rawEmbedding = chunk.embedding;
    const chunkVector = Array.isArray(rawEmbedding)
      ? (rawEmbedding as number[])
      : [];

    const similarity = cosineSimilarity(queryEmbedding, chunkVector);

    if (similarity >= threshold) {
      scoredMatches.push({
        chunkId: chunk.id,
        knowledgeSourceId: chunk.knowledgeSource.id,
        sourceTitle: chunk.knowledgeSource.title,
        sourceType: chunk.knowledgeSource.sourceType,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        similarity: Number(similarity.toFixed(4)),
        isPublic: chunk.knowledgeSource.isPublic,
      });
    }
  }

  // 4. Sort descending by similarity score
  scoredMatches.sort((a, b) => b.similarity - a.similarity);

  const topMatches = scoredMatches.slice(0, topK);

  // 5. MANDATORY ABSTENTION: if zero chunks clear the threshold
  if (topMatches.length === 0) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      query,
      thresholdUsed: threshold,
      embeddingProvider: providerName,
      matches: [],
      explanation: `Insufficient evidence: zero knowledge chunks cleared similarity threshold ${threshold} for query '${query}'.`,
    };
  }

  return {
    status: 'GROUNDED_EVIDENCE_FOUND',
    query,
    thresholdUsed: threshold,
    embeddingProvider: providerName,
    matches: topMatches,
    explanation: `Found ${topMatches.length} grounded evidence chunk(s) clearing similarity threshold ${threshold}.`,
  };
}
