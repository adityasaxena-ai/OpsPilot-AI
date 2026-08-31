import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cosineSimilarity } from './similarity.js';
import { chunkText } from './chunking.js';
import { performGroundedRetrieval } from './retrieval.js';
import type { PrismaClient } from '@prisma/client';

describe('RAG Cosine Similarity Unit Tests', () => {
  it('calculates 1.0 for identical vectors', () => {
    const vecA = [0.5, 0.5, 0.5, 0.5];
    const vecB = [0.5, 0.5, 0.5, 0.5];
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0, 5);
  });

  it('calculates 0.0 for orthogonal vectors', () => {
    const vecA = [1, 0];
    const vecB = [0, 1];
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0.0, 5);
  });

  it('calculates -1.0 for opposite vectors', () => {
    const vecA = [1, 0];
    const vecB = [-1, 0];
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(-1.0, 5);
  });

  it('handles zero vectors safely without division by zero', () => {
    const vecA = [0, 0, 0];
    const vecB = [1, 2, 3];
    expect(cosineSimilarity(vecA, vecB)).toBe(0);
  });

  it('handles vector length mismatch safely', () => {
    const vecA = [1, 2];
    const vecB = [1, 2, 3];
    expect(cosineSimilarity(vecA, vecB)).toBe(0);
  });
});

describe('RAG Character Chunking Unit Tests', () => {
  it('chunks text cleanly with specified chunkSize and overlap', () => {
    const text = '1234567890'.repeat(20); // 200 chars
    const chunks = chunkText(text, { chunkSize: 100, overlap: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.chunkIndex).toBe(0);
    expect(chunks[0]!.content.length).toBeLessThanOrEqual(100);
    expect(chunks[1]!.chunkIndex).toBe(1);
  });

  it('returns empty array for empty or whitespace text', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   ')).toEqual([]);
  });
});

describe('RAG Retrieval Abstention Unit Test', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/opspilot';
    process.env.JWT_SECRET = 'test-jwt-secret-key-32-chars-long!!';
  });

  it('returns INSUFFICIENT_EVIDENCE when no chunks clear similarity threshold', async () => {
    const mockPrisma = {
      knowledgeChunk: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'chunk-1',
            content: 'Kubernetes pod crashloop backoff troubleshooting steps',
            embedding: [0.1, 0.2, 0.3],
            knowledgeSource: {
              id: 'ks-1',
              title: 'K8s Troubleshooting Guide',
              sourceType: 'RUNBOOK',
              isPublic: true,
            },
          },
        ]),
      },
    } as unknown as PrismaClient;

    const result = await performGroundedRetrieval(
      mockPrisma,
      'Completely unrelated non-existent concept xyz123',
      { threshold: 0.9999, topK: 5, userRoles: ['VIEWER'] }
    );

    expect(result.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.matches).toEqual([]);
    expect(result.explanation).toContain('zero knowledge chunks cleared similarity threshold');
  });

  it('returns INSUFFICIENT_EVIDENCE when database contains no knowledge sources', async () => {
    const mockPrismaEmpty = {
      knowledgeChunk: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaClient;

    const result = await performGroundedRetrieval(
      mockPrismaEmpty,
      'Any query',
      { threshold: 0.4, topK: 5, userRoles: ['VIEWER'] }
    );

    expect(result.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.matches).toEqual([]);
    expect(result.explanation).toBe('No accessible active knowledge sources available in database.');
  });
});
