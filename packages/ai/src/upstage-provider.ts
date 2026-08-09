import type { AIProvider, AIPrompt, AIResponse } from './provider.js';
import { parseAndValidateLlmJson } from './json-utils.js';

export class UpstageProvider implements AIProvider {
  name = 'upstage';

  private apiKey: string;
  private defaultModel: string;
  private baseUrl = 'https://api.upstage.ai/v1';

  constructor(apiKey: string, defaultModel = 'solar-mini') {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  async complete<T>(prompt: AIPrompt<T>): Promise<AIResponse<T>> {
    const modelName = this.defaultModel;

    const messages = [
      ...(prompt.systemPrompt
        ? [{ role: 'system' as const, content: prompt.systemPrompt }]
        : []),
      ...prompt.messages.map((message) => ({
        role: message.role === 'model' ? ('assistant' as const) : message.role,
        content: message.content,
      })),
    ];

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        messages,
        temperature: prompt.temperature ?? 0.2,
        max_tokens: prompt.maxTokens ?? 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `[UpstageProvider] API request failed (${response.status}): ${errorText}`,
      );
    }

    const result = (await response.json()) as {
      id?: string;
      model?: string;
      choices?: Array<{
        message?: {
          content?: string;
        };
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const text = result.choices?.[0]?.message?.content ?? '';
    console.log('[UpstageProvider] Raw AI response:', text);

    const tokenUsage = {
      promptTokens: result.usage?.prompt_tokens ?? 0,
      completionTokens: result.usage?.completion_tokens ?? 0,
      totalTokens: result.usage?.total_tokens ?? 0,
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
      finishReason: result.choices?.[0]?.finish_reason ?? 'stop',
    };
  }

  async embed(_text: string): Promise<number[]> {
    throw new Error(
      '[UpstageProvider] Embeddings are not implemented yet. Use a dedicated embedding provider for RAG.',
    );
  }
}