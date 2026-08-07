import type { ZodSchema } from 'zod';

export interface AIMessage {
  role: 'user' | 'model' | 'system';
  content: string;
}

export interface AIPrompt<T = unknown> {
  systemPrompt?: string;
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  responseSchema?: ZodSchema<T>;
}

export interface AIResponse<T = unknown> {
  text: string;
  data?: T;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: string;
}

export interface AIProvider {
  name: string;
  complete<T>(prompt: AIPrompt<T>): Promise<AIResponse<T>>;
  embed(text: string): Promise<number[]>;
}
