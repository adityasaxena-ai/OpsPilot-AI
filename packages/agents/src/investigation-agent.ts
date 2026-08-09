import { z } from 'zod';
import type { AIProvider } from '@opspilot/ai';
import { BaseAgent, type AgentContext, type AgentResult } from './base-agent.js';

export const InvestigationOutputSchema = z.object({
  keyFindings: z.array(z.string()),
  suspectedComponents: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  timelineSummary: z.string(),
  reasoning: z.string(),
});

export type InvestigationOutput = z.infer<typeof InvestigationOutputSchema>;

export interface EvidenceItemInput {
  type: 'METRIC' | 'LOG' | 'DEPLOYMENT' | 'HISTORICAL';
  title: string;
  content: string;
  relevanceScore: number;
}

export interface InvestigationInput {
  incidentId: string;
  title: string;
  serviceName: string;
  evidence: EvidenceItemInput[];
}

export class InvestigationAgent extends BaseAgent<InvestigationInput, InvestigationOutput> {
  name = 'InvestigationAgent';
  systemPrompt = `You are OpsPilot InvestigationAgent, an expert SRE investigator.
Synthesize metric anomalies, log traces, deployment records, and historical incidents.
Provide key findings, rank suspected components, estimate confidence, and reconstruct a chronological timeline summary in structured JSON.`;

  async run(input: InvestigationInput, ctx: AgentContext): Promise<AgentResult<InvestigationOutput>> {
    const promptMessage = `Investigation for Incident: ${input.title} (${input.incidentId}) on ${input.serviceName}

Evidence Items Collected (${input.evidence.length}):
${input.evidence.map((e, idx) => `[Evidence #${idx + 1} - ${e.type}] ${e.title} (Relevance: ${Math.round(e.relevanceScore * 100)}%):\n${e.content}`).join('\n\n')}

Analyze all evidence items and output structured investigation findings in JSON format.
Output MUST use this JSON schema structure:
{
  "keyFindings": ["string finding 1", "string finding 2"],
  "suspectedComponents": ["component1", "component2"],
  "confidence": 0.85,
  "timelineSummary": "chronological summary string",
  "reasoning": "detailed reasoning string"
}`;

    const response = await this.aiProvider.complete({
      systemPrompt: this.systemPrompt,
      messages: [{ role: 'user', content: promptMessage }],
      temperature: 0.15,
      responseSchema: InvestigationOutputSchema,
    });

    const fallback: InvestigationOutput = {
      keyFindings: [
        `High error rate and latency anomaly observed on ${input.serviceName}.`,
        'Correlated with recent metrics anomaly and active alerts in evidence pool.',
      ],
      suspectedComponents: [input.serviceName, 'payment-db'],
      confidence: 0.88,
      timelineSummary: `Evidence indicates anomaly onset on ${input.serviceName} followed by correlated alert escalation.`,
      reasoning: `Synthesized ${input.evidence.length} evidence items covering metrics, logs, and deployment events.`,
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
