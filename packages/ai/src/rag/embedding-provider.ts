import { getConfig } from '@opspilot/config';
import type { AIProvider } from '../provider.js';
import { GeminiProvider } from '../gemini-provider.js';
import { MockProvider } from '../mock-provider.js';

export interface EmbeddingResult {
  embedding: number[];
  providerName: string;
}

let _embeddingProviderInstance: { provider: AIProvider; name: string } | null = null;

/**
 * Returns an embedding-capable AIProvider.
 * Explicitly separates embedding capability from text completion provider selection:
 * - GeminiProvider supports embed() directly via Google AI text-embedding-004.
 * - MockProvider supports embed() directly via deterministic synthetic vectors.
 * - Anthropic and Upstage do not support embed() and are excluded from embedding selection.
 */
export function getEmbeddingProvider(): { provider: AIProvider; name: string } {
  if (_embeddingProviderInstance) {
    return _embeddingProviderInstance;
  }

  const config = getConfig();

  if (config.AI_PROVIDER === 'gemini' && config.GEMINI_API_KEY) {
    _embeddingProviderInstance = {
      provider: new GeminiProvider(config.GEMINI_API_KEY, config.AI_MODEL),
      name: 'gemini-text-embedding-004',
    };
  } else {
    _embeddingProviderInstance = {
      provider: new MockProvider(),
      name: 'mock-synthetic-768d',
    };
  }

  return _embeddingProviderInstance;
}

export function resetEmbeddingProvider(): void {
  _embeddingProviderInstance = null;
}

export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const { provider, name } = getEmbeddingProvider();
  const embedding = await provider.embed(text);
  return { embedding, providerName: name };
}
