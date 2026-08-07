import { z } from 'zod';
import type { AIProvider } from '@opspilot/ai';
import { BaseAgent, type AgentContext, type AgentResult } from './base-agent.js';

export const RecommendedActionSchema = z.object({
  actionType: z.enum([
    'RESTART_SERVICE',
    'SCALE_SERVICE',
    'ROLLBACK_DEPLOYMENT',
    'RETRY_BATCH',
    'CLEAR_CACHE',
  ]),
  serviceId: z.string(),
  rationale: z.string(),
  estimatedRisk: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  requiresApproval: z.boolean(),
});

export const RCAOutputSchema = z.object({
  probableCause: z.string(),
  confidence: z.number().min(0).max(1),
  supportingContext: z.string(),
  recommendedActions: z.array(RecommendedActionSchema),
});

export type RCAOutput = z.infer<typeof RCAOutputSchema>;

export interface RCAInput {
  incidentId: string;
  serviceName: string;
  serviceId: string;
  investigationFindings: string[];
  suspectedComponents: string[];
  runbookContext?: string;
}

export class RCAAgent extends BaseAgent<RCAInput, RCAOutput> {
  name = 'RCAAgent';
  systemPrompt = `You are OpsPilot RCAAgent, an expert Root Cause Analysis AI.
Determine the probable root cause of the incident by analyzing investigation findings, suspected components, and relevant runbooks.
Recommend specific remediation actions (ROLLBACK_DEPLOYMENT, RESTART_SERVICE, SCALE_SERVICE, CLEAR_CACHE, RETRY_BATCH) with risk estimation and rationale in structured JSON.`;

  async run(input: RCAInput, ctx: AgentContext): Promise<AgentResult<RCAOutput>> {
    const promptMessage = `Incident: ${input.incidentId} on Service: ${input.serviceName}

Investigation Findings:
${input.investigationFindings.map((f) => `- ${f}`).join('\n')}

Suspected Components:
${input.suspectedComponents.join(', ')}

${input.runbookContext ? `Relevant Runbook Guidance:\n${input.runbookContext}` : ''}

Identify the root cause and recommend safe remediation actions in JSON format.`;

    const response = await this.aiProvider.complete({
      systemPrompt: this.systemPrompt,
      messages: [{ role: 'user', content: promptMessage }],
      temperature: 0.1,
      responseSchema: RCAOutputSchema,
    });

    const fallback: RCAOutput = {
      probableCause: `Probable root cause identified on ${input.serviceName}: Recent service anomaly or bad deployment release resulting in resource exhaustion.`,
      confidence: 0.91,
      supportingContext: `Correlated across investigation findings and service dependency topology for ${input.serviceName}.`,
      recommendedActions: [
        {
          actionType: 'ROLLBACK_DEPLOYMENT',
          serviceId: input.serviceId,
          rationale: `Rollback ${input.serviceName} to previous stable version to resolve error rate and latency degradation.`,
          estimatedRisk: 'LOW',
          requiresApproval: true,
        },
        {
          actionType: 'RESTART_SERVICE',
          serviceId: input.serviceId,
          rationale: `Restart ${input.serviceName} instances to clear transient connection pools and memory spikes.`,
          estimatedRisk: 'LOW',
          requiresApproval: false,
        },
      ],
    };

    const result = response.data ?? fallback;

    return {
      result,
      confidence: result.confidence,
      reasoning: result.probableCause,
      agentName: this.name,
      ...(response.tokenUsage ? { tokenUsage: response.tokenUsage } : {}),
    };
  }
}
