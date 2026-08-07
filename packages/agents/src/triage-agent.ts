import { z } from 'zod';
import type { AIProvider } from '@opspilot/ai';
import { BaseAgent, type AgentContext, type AgentResult } from './base-agent.js';

export const TriageOutputSchema = z.object({
  severity: z.enum(['P1', 'P2', 'P3', 'P4', 'P5']),
  impact: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  summary: z.string(),
  affectedService: z.string(),
  businessImpact: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  recommendedNextStep: z.string(),
});

export type TriageOutput = z.infer<typeof TriageOutputSchema>;

export interface TriageInput {
  incidentId: string;
  title: string;
  description: string;
  serviceName: string;
  serviceTier: string;
  alerts: Array<{
    title: string;
    description: string;
    severity: string;
    occurrenceCount: number;
  }>;
}

export class TriageAgent extends BaseAgent<TriageInput, TriageOutput> {
  name = 'TriageAgent';
  systemPrompt = `You are OpsPilot TriageAgent, an expert SRE AI.
Analyze the incident context, correlated alerts, service tier, and impact.
Provide a structured JSON output classifying severity (P1-P5), impact, summary, affected service, business impact, confidence (0.0 to 1.0), reasoning, and recommended next step.`;

  async run(input: TriageInput, ctx: AgentContext): Promise<AgentResult<TriageOutput>> {
    const promptMessage = `Incident Context:
ID: ${input.incidentId}
Title: ${input.title}
Description: ${input.description}
Service: ${input.serviceName} (Tier: ${input.serviceTier})

Correlated Alerts (${input.alerts.length}):
${input.alerts.map((a) => `- [${a.severity}] ${a.title} (${a.occurrenceCount}x): ${a.description}`).join('\n')}

Classify severity (P1=Critical, P2=High, P3=Medium, P4=Low, P5=Minor) and provide triage analysis in JSON.`;

    const response = await this.aiProvider.complete({
      systemPrompt: this.systemPrompt,
      messages: [{ role: 'user', content: promptMessage }],
      temperature: 0.1,
      responseSchema: TriageOutputSchema,
    });

    const fallback: TriageOutput = {
      severity: input.alerts.some((a) => a.severity === 'P1') ? 'P1' : 'P2',
      impact: input.serviceTier === 'T1' ? 'HIGH' : 'MEDIUM',
      summary: `Automated triage for ${input.title} on ${input.serviceName}`,
      affectedService: input.serviceName,
      businessImpact: `Potential service degradation on ${input.serviceName} (${input.serviceTier})`,
      confidence: 0.85,
      reasoning: `Triaged based on alert cluster (${input.alerts.length} alerts) on Tier 1 service ${input.serviceName}.`,
      recommendedNextStep: 'Collect log and metric evidence for root cause analysis.',
    };

    const result = response.data ?? fallback;

    return {
      result,
      confidence: result.confidence,
      reasoning: result.reasoning,
      agentName: this.name,
      ...(response.tokenUsage ? { tokenUsage: response.tokenUsage } : {}),
    };
  }
}
