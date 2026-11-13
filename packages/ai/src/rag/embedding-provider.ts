import type { AIProvider } from '../provider.js';
import { readAISettings, selectEmbeddingProvider } from '../provider-factory.js';

export interface EmbeddingResult {
  embedding: number[];
  providerName: string;
}

let _embeddingProviderInstance: { provider: AIProvider; name: string } | null = null;

/** L20: gated on ENABLE_LLM_EMBEDDINGS (off in Phase 4). L12: no mock fallback. */
export function getEmbeddingProvider(): { provider: AIProvider; name: string } {
  if (!_embeddingProviderInstance) {
    _embeddingProviderInstance = selectEmbeddingProvider(readAISettings());
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
