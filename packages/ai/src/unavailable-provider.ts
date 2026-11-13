import type { AIProvider, AIPrompt, AIResponse } from './provider.js';

export class AIUnavailableError extends Error {
  readonly statusCode = 503;
  readonly code = 'AI_UNAVAILABLE';
  constructor(public readonly reason: string) {
    super(`AI unavailable (${reason})`);
    this.name = 'AIUnavailableError';
  }
}

export class AIConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIConfigError';
  }
}

/** L12: explicit "AI unavailable" state. Never returns fabricated output. */
export class UnavailableProvider implements AIProvider {
  readonly name = 'unavailable';
  constructor(public readonly reason: string) {}

  async complete<T>(_prompt: AIPrompt<T>): Promise<AIResponse<T>> {
    throw new AIUnavailableError(this.reason);
  }

  async embed(_text: string): Promise<number[]> {
    throw new AIUnavailableError(this.reason);
  }
}
