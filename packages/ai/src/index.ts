import { getConfig } from '@opspilot/config';
import type { AIProvider } from './provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { MockProvider } from './mock-provider.js';
import { UpstageProvider } from './upstage-provider.js';
import { AnthropicProvider } from './anthropic-provider.js';

export * from './provider.js';
export * from './gemini-provider.js';
export * from './mock-provider.js';
export * from './upstage-provider.js';
export * from './anthropic-provider.js';
export * from './json-utils.js';
export * from './rag/chunking.js';
export * from './rag/similarity.js';
export * from './rag/embedding-provider.js';
export * from './rag/retrieval.js';

let _providerInstance: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (_providerInstance) return _providerInstance;

  const config = getConfig();

  if (config.AI_PROVIDER === 'anthropic' && config.ANTHROPIC_API_KEY) {
    const model = config.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
    _providerInstance = new AnthropicProvider(config.ANTHROPIC_API_KEY, model);
    console.log(`[AI] Initialized AnthropicProvider (model: ${model})`);
  } else if (config.AI_PROVIDER === 'gemini' && config.GEMINI_API_KEY) {
    _providerInstance = new GeminiProvider(config.GEMINI_API_KEY, config.AI_MODEL);
    console.log(`[AI] Initialized GeminiProvider (model: ${config.AI_MODEL})`);
  } else if (config.AI_PROVIDER === 'upstage' && config.UPSTAGE_API_KEY) {
    _providerInstance = new UpstageProvider(
      config.UPSTAGE_API_KEY,
      config.UPSTAGE_MODEL,
    );
    console.log(`[AI] Initialized UpstageProvider (model: ${config.UPSTAGE_MODEL})`);
  } else {
    _providerInstance = new MockProvider();
    if (config.AI_PROVIDER === 'anthropic' && !config.ANTHROPIC_API_KEY) {
      console.log('[AI] ANTHROPIC_API_KEY missing — falling back to MockProvider');
    } else if (config.AI_PROVIDER === 'gemini' && !config.GEMINI_API_KEY) {
      console.log('[AI] GEMINI_API_KEY missing — falling back to MockProvider');
    } else {
      console.log('[AI] Initialized MockProvider');
    }
  }

  return _providerInstance;
}

export function resetAIProvider(): void {
  _providerInstance = null;
}
