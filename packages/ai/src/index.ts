import { getConfig } from '@opspilot/config';
import type { AIProvider } from './provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { MockProvider } from './mock-provider.js';

export * from './provider.js';
export * from './gemini-provider.js';
export * from './mock-provider.js';

let _providerInstance: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (_providerInstance) return _providerInstance;

  const config = getConfig();

  if (config.AI_PROVIDER === 'gemini' && config.GEMINI_API_KEY) {
    _providerInstance = new GeminiProvider(config.GEMINI_API_KEY, config.AI_MODEL);
    console.log(`[AI] Initialized GeminiProvider (model: ${config.AI_MODEL})`);
  } else {
    _providerInstance = new MockProvider();
    if (config.AI_PROVIDER === 'gemini' && !config.GEMINI_API_KEY) {
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
