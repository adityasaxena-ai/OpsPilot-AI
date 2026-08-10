import type { AIProvider, AIPrompt, AIResponse } from './provider.js';
import { parseAndValidateLlmJson } from './json-utils.js';

export class AnthropicProvider implements AIProvider {
  name = 'anthropic';

  private apiKey: string;
  private defaultModel: string;
  private baseUrl = 'https://api.anthropic.com/v1';

  constructor(apiKey: string, defaultModel = 'claude-sonnet-4-6') {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  async complete<T>(prompt: AIPrompt<T>): Promise<AIResponse<T>> {
    const modelName = this.defaultModel;

    const messages = prompt.messages.map((message) => ({
      role: message.role === 'model' ? ('assistant' as const) : ('user' as const),
      content: message.content,
    }));

    const body: Record<string, unknown> = {
      model: modelName,
      messages,
      max_tokens: prompt.maxTokens ?? 4096,
      temperature: prompt.temperature ?? 0.2,
    };

    if (prompt.systemPrompt) {
      body.system = prompt.systemPrompt;
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `[AnthropicProvider] API request failed (${response.status}): ${errorText}`,
      );
    }

    const result = (await response.json()) as {
      id?: string;
      model?: string;
      content?: Array<{
        type?: string;
        text?: string;
      }>;
      stop_reason?: string;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
      };
    };

    const text =
      result.content
        ?.filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('') ?? '';

    console.log('[AnthropicProvider] Raw AI response length:', text.length);

    const tokenUsage = {
      promptTokens: result.usage?.input_tokens ?? 0,
      completionTokens: result.usage?.output_tokens ?? 0,
      totalTokens:
        (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0),
    };

    let data: T | undefined;

    if (prompt.responseSchema) {
      data = parseAndValidateLlmJson(text, prompt.responseSchema);
    }

    return {
      text,
      ...(data !== undefined ? { data } : {}),
      tokenUsage,
      model: result.model ?? modelName,
      finishReason: result.stop_reason ?? 'end_turn',
    };
  }

  async embed(_text: string): Promise<number[]> {
    throw new Error(
      '[AnthropicProvider] Embeddings are not supported directly by Anthropic Messages API.',
    );
  }
}
