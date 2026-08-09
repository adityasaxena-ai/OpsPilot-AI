import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIProvider, AIPrompt, AIResponse } from './provider.js';
import { parseAndValidateLlmJson } from './json-utils.js';

export class GeminiProvider implements AIProvider {
  name = 'gemini';
  private client: GoogleGenerativeAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = 'gemini-2.0-flash') {
    this.client = new GoogleGenerativeAI(apiKey);
    this.defaultModel = defaultModel;
  }

  async complete<T>(prompt: AIPrompt<T>): Promise<AIResponse<T>> {
    const modelName = this.defaultModel;
    const model = this.client.getGenerativeModel({
      model: modelName,
      ...(prompt.systemPrompt ? { systemInstruction: prompt.systemPrompt } : {}),
      generationConfig: {
        temperature: prompt.temperature ?? 0.2,
        maxOutputTokens: prompt.maxTokens ?? 4096,
        responseMimeType: prompt.responseSchema ? 'application/json' : 'text/plain',
      },
    });

    const contents = prompt.messages.map((m) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const result = await model.generateContent({ contents });
    const response = await result.response;
    const text = response.text();

    const usage = response.usageMetadata;
    const tokenUsage = {
      promptTokens: usage?.promptTokenCount ?? 0,
      completionTokens: usage?.candidatesTokenCount ?? 0,
      totalTokens: usage?.totalTokenCount ?? 0,
    };

    let data: T | undefined;
    if (prompt.responseSchema) {
      data = parseAndValidateLlmJson(text, prompt.responseSchema);
    }

    return {
      text,
      ...(data !== undefined ? { data } : {}),
      tokenUsage,
      model: modelName,
      finishReason: 'STOP',
    };
  }

  async embed(text: string): Promise<number[]> {
    const embeddingModel = this.client.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await embeddingModel.embedContent(text);
    return result.embedding.values;
  }
}
