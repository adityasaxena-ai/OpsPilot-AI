import type { AIProvider } from './provider.js';
import { readAISettings, selectGenerationProvider, describeProvider } from './provider-factory.js';
import { getEmbeddingProvider } from './rag/embedding-provider.js';

export * from './provider.js';
export * from './gemini-provider.js';
export * from './mock-provider.js';
export * from './unavailable-provider.js';
export * from './guardrails.js';
export * from './provider-factory.js';
export * from './json-utils.js';
export * from './rag/chunking.js';
export * from './rag/similarity.js';
export * from './rag/embedding-provider.js';
export * from './rag/retrieval.js';

let _providerInstance: AIProvider | null = null;

/** L12: no silent fallback. Returns UnavailableProvider when AI is off. */
export function getAIProvider(): AIProvider {
  if (!_providerInstance) _providerInstance = selectGenerationProvider(readAISettings());
  return _providerInstance;
}

export function resetAIProvider(): void {
  _providerInstance = null;
}

/** Eager init at API boot: config or guardrail errors fail the boot loudly. */
export function initAI(): { generation: string; embeddings: string } {
  return {
    generation: describeProvider(getAIProvider()),
    embeddings: getEmbeddingProvider().name,
  };
}
