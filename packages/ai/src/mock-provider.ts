import type { AIProvider, AIPrompt, AIResponse } from './provider.js';

export class MockProvider implements AIProvider {
  name = 'mock';

  async complete<T>(prompt: AIPrompt<T>): Promise<AIResponse<T>> {
    const userMessage = prompt.messages[prompt.messages.length - 1]?.content ?? '';
    const systemPrompt = prompt.systemPrompt ?? '';

    let text = '';
    let mockData: Record<string, unknown> = {};

    if (systemPrompt.includes('TriageAgent') || userMessage.includes('triage') || userMessage.includes('severity')) {
      mockData = {
        severity: 'P1',
        impact: 'HIGH',
        summary: 'P1 critical incident: High error rate and latency degradation on payments processing pipeline.',
        affectedService: 'payments-api',
        businessImpact: 'Customer checkout failures and payment gateway timeouts',
        confidence: 0.92,
        reasoning: 'Correlated 4 alerts across payments-api and payment-db following a recent bad deployment. Error rate is 25% (threshold 10%).',
        recommendedNextStep: 'Collect telemetry logs and check recent deployments for payments-api.',
      };
      text = JSON.stringify(mockData, null, 2);
    } else if (systemPrompt.includes('InvestigationAgent') || userMessage.includes('investigate')) {
      mockData = {
        keyFindings: [
          'High error rate (25%) detected on payments-api immediately after deployment v2.4.0-bad.',
          'Database connection pool on payment-db reached 98% utilization.',
          'Downstream service fraud-engine reporting 504 Gateway Timeouts.',
        ],
        suspectedComponents: ['payments-api', 'payment-db', 'sim_deployment_v2.4.0-bad'],
        confidence: 0.88,
        timelineSummary: '10:00 AM Bad deployment v2.4.0-bad applied → 10:02 AM P99 latency spiked to 3500ms → 10:03 AM Alerts triggered → 10:05 AM Incident auto-correlated.',
      };
      text = JSON.stringify(mockData, null, 2);
    } else if (systemPrompt.includes('RCAAgent') || userMessage.includes('rca') || userMessage.includes('root cause')) {
      mockData = {
        probableCause: 'Bad deployment (v2.4.0-bad) containing unindexed database queries on payments-api, leading to DB connection pool exhaustion.',
        confidence: 0.94,
        supportingContext: 'Code changes in commit #b8a91c introduced un-paginated queries to transaction history table, consuming 100% of payment-db pool connections.',
        recommendedActions: [
          {
            actionType: 'ROLLBACK_DEPLOYMENT',
            serviceId: 'payments-api',
            rationale: 'Rollback to stable version v2.3.9 to restore normal DB connection pool levels.',
            estimatedRisk: 'LOW',
            requiresApproval: true,
          },
          {
            actionType: 'RESTART_SERVICE',
            serviceId: 'payments-api',
            rationale: 'Restart service instances to flush orphaned DB connections if rollback is delayed.',
            estimatedRisk: 'LOW',
            requiresApproval: false,
          },
        ],
      };
      text = JSON.stringify(mockData, null, 2);
    } else if (systemPrompt.includes('PostmortemAgent') || userMessage.includes('postmortem')) {
      mockData = {
        summary: 'High error rate and latency degradation on Payments API due to a bad deployment containing unindexed queries.',
        businessImpact: 'Approx. 450 payment transactions delayed or failed during a 15-minute window.',
        rootCause: 'Deployment v2.4.0-bad introduced un-indexed DB queries leading to payment-db connection pool exhaustion.',
        detectionMethod: 'Auto-detected by OpsPilot simulator anomaly threshold rules within 45 seconds.',
        remediationSummary: 'Deployment rolled back to v2.3.9; DB connection pool returned to baseline (10 connections active).',
        preventiveActions: [
          'Add automated DB query linter in CI/CD pipeline.',
          'Add connection pool metrics threshold alert at 80% capacity.',
          'Enforce mandatory staging load test for all payments-api releases.',
        ],
      };
      text = JSON.stringify(mockData, null, 2);
    } else {
      mockData = {
        response: 'AI response processed successfully with simulated operational intelligence context.',
        confidence: 0.85,
      };
      text = JSON.stringify(mockData, null, 2);
    }

    let parsedData: T | undefined;
    if (prompt.responseSchema) {
      try {
        parsedData = prompt.responseSchema.parse(mockData);
      } catch (err) {
        console.warn('[MockProvider] Zod parse warning:', err);
      }
    }

    return {
      text,
      ...(parsedData !== undefined ? { data: parsedData } : {}),
      tokenUsage: { promptTokens: 250, completionTokens: 180, totalTokens: 430 },
      model: 'mock-ai-v1',
      finishReason: 'STOP',
    };
  }

  async embed(text: string): Promise<number[]> {
    // Generate deterministic 768-dim mock vector pseudo-randomly seeded by string length
    const vector: number[] = [];
    const seed = text.length;
    for (let i = 0; i < 768; i++) {
      vector.push(Math.sin(seed + i) * 0.5);
    }
    return vector;
  }
}
