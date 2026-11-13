import { getConfig } from '@opspilot/config';
import type { AIProvider } from './provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { MockProvider } from './mock-provider.js';
import { UnavailableProvider, AIConfigError } from './unavailable-provider.js';
import { assertGuardrailsRegistered } from './guardrails.js';

export interface AISettings {
  AI_PROVIDER: 'mock' | 'gemini';
  AI_MODEL?: string | undefined;
  GEMINI_API_KEY?: string | undefined;
  ENABLE_LLM_GENERATION: boolean;
  ENABLE_LLM_EMBEDDINGS: boolean;
  AI_ALLOW_MOCK: boolean;
  onRender: boolean;
}

export function readAISettings(): AISettings {
  const c = getConfig();
  return {
    AI_PROVIDER: c.AI_PROVIDER,
    AI_MODEL: c.AI_MODEL,
    GEMINI_API_KEY: c.GEMINI_API_KEY,
    ENABLE_LLM_GENERATION: c.ENABLE_LLM_GENERATION,
    ENABLE_LLM_EMBEDDINGS: c.ENABLE_LLM_EMBEDDINGS,
    AI_ALLOW_MOCK: c.AI_ALLOW_MOCK,
    onRender: process.env.RENDER === 'true',
  };
}

function selectMock(s: AISettings): AIProvider | null {
  if (!s.AI_ALLOW_MOCK) return null;
  if (s.onRender) throw new AIConfigError('AI_ALLOW_MOCK must not be enabled on Render (L12)');
  return new MockProvider();
}

function selectGemini(
  s: AISettings,
  flag: 'ENABLE_LLM_GENERATION' | 'ENABLE_LLM_EMBEDDINGS',
): AIProvider {
  if (!s[flag]) return new UnavailableProvider(`${flag.toLowerCase()}=false`);
  if (!s.GEMINI_API_KEY || !s.AI_MODEL) {
    throw new AIConfigError(`${flag}=true requires GEMINI_API_KEY and AI_MODEL`);
  }
  assertGuardrailsRegistered();
  return new GeminiProvider(s.GEMINI_API_KEY, s.AI_MODEL);
}

export function selectGenerationProvider(s: AISettings): AIProvider {
  if (s.AI_PROVIDER === 'gemini') return selectGemini(s, 'ENABLE_LLM_GENERATION');
  return selectMock(s) ?? new UnavailableProvider('mock_not_allowed');
}

export function selectEmbeddingProvider(s: AISettings): { provider: AIProvider; name: string } {
  if (s.AI_PROVIDER === 'gemini') {
    const provider = selectGemini(s, 'ENABLE_LLM_EMBEDDINGS');
    const name = provider instanceof UnavailableProvider ? 'unavailable' : 'gemini-text-embedding-004';
    return { provider, name };
  }
  const mock = selectMock(s);
  return mock
    ? { provider: mock, name: 'mock-synthetic-768d' }
    : { provider: new UnavailableProvider('mock_not_allowed'), name: 'unavailable' };
}

export function describeProvider(p: AIProvider): string {
  return p instanceof UnavailableProvider ? `unavailable (${p.reason})` : p.name;
}
