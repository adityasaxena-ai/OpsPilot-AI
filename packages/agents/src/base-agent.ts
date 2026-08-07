import type { AIProvider } from '@opspilot/ai';

export interface AgentContext {
  incidentId: string;
  serviceId?: string;
  environment?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentResult<T> {
  result: T;
  confidence: number;
  reasoning: string;
  agentName: string;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export abstract class BaseAgent<TInput, TOutput> {
  abstract name: string;
  abstract systemPrompt: string;

  constructor(protected aiProvider: AIProvider) {}

  abstract run(input: TInput, ctx: AgentContext): Promise<AgentResult<TOutput>>;
}
