import { describe, it, expect, vi, beforeEach } from 'vitest';

const { geminiCtor } = vi.hoisted(() => ({ geminiCtor: vi.fn() }));
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    constructor(key: string) { geminiCtor(key); }
    getGenerativeModel() { return {}; }
  },
}));

import { selectGenerationProvider, selectEmbeddingProvider, type AISettings } from './provider-factory.js';
import { UnavailableProvider, AIUnavailableError, AIConfigError } from './unavailable-provider.js';
import { GuardrailMissingError, registerGuardrail, resetGuardrails, REQUIRED_GUARDRAILS } from './guardrails.js';
import { MockProvider } from './mock-provider.js';
import { GeminiProvider } from './gemini-provider.js';

const base: AISettings = {
  AI_PROVIDER: 'gemini',
  AI_MODEL: 'test-model',
  GEMINI_API_KEY: 'dummy-not-a-key',
  ENABLE_LLM_GENERATION: false,
  ENABLE_LLM_EMBEDDINGS: false,
  AI_ALLOW_MOCK: false,
  onRender: false,
};
const registerAll = () => { for (const g of REQUIRED_GUARDRAILS) registerGuardrail(g); };

beforeEach(() => { geminiCtor.mockClear(); resetGuardrails(); });

describe('L20 generation flag', () => {
  it('key present + flag off -> unavailable, SDK never constructed', () => {
    expect(selectGenerationProvider(base)).toBeInstanceOf(UnavailableProvider);
    expect(geminiCtor).not.toHaveBeenCalled();
  });
  it('flag on + no guardrails -> throws before SDK init', () => {
    expect(() => selectGenerationProvider({ ...base, ENABLE_LLM_GENERATION: true })).toThrow(GuardrailMissingError);
    expect(geminiCtor).not.toHaveBeenCalled();
  });
  it('flag on + partial guardrails -> throws', () => {
    registerGuardrail('redactor');
    expect(() => selectGenerationProvider({ ...base, ENABLE_LLM_GENERATION: true })).toThrow(GuardrailMissingError);
  });
  it('flag on + all guardrails -> GeminiProvider', () => {
    registerAll();
    expect(selectGenerationProvider({ ...base, ENABLE_LLM_GENERATION: true })).toBeInstanceOf(GeminiProvider);
    expect(geminiCtor).toHaveBeenCalledTimes(1);
  });
});

describe('L10 single model source', () => {
  it('flag on without AI_MODEL -> config error', () => {
    registerAll();
    expect(() => selectGenerationProvider({ ...base, ENABLE_LLM_GENERATION: true, AI_MODEL: undefined })).toThrow(AIConfigError);
  });
  it('GeminiProvider has no default model', () => {
    expect(() => new GeminiProvider('k', '')).toThrow();
  });
});

describe('L12 no silent fallback', () => {
  const mock: AISettings = { ...base, AI_PROVIDER: 'mock' };
  it('mock not allowed -> unavailable', () => {
    expect(selectGenerationProvider(mock)).toBeInstanceOf(UnavailableProvider);
  });
  it('mock allowed off-Render -> MockProvider', () => {
    expect(selectGenerationProvider({ ...mock, AI_ALLOW_MOCK: true })).toBeInstanceOf(MockProvider);
  });
  it('mock allowed on Render -> refused', () => {
    expect(() => selectGenerationProvider({ ...mock, AI_ALLOW_MOCK: true, onRender: true })).toThrow(AIConfigError);
  });
  it('unavailable provider rejects with 503 AI_UNAVAILABLE', async () => {
    const p = new UnavailableProvider('test');
    await expect(p.complete({ messages: [] })).rejects.toMatchObject({ statusCode: 503, code: 'AI_UNAVAILABLE' });
    await expect(p.embed('x')).rejects.toBeInstanceOf(AIUnavailableError);
  });
});

describe('L20 embeddings flag is independent', () => {
  it('generation on does not enable embeddings', () => {
    registerAll();
    const e = selectEmbeddingProvider({ ...base, ENABLE_LLM_GENERATION: true });
    expect(e.name).toBe('unavailable');
    expect(geminiCtor).not.toHaveBeenCalled();
  });
});
