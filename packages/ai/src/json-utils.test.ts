import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { extractJsonString, normalizeLlmObject, parseAndValidateLlmJson } from './json-utils.js';

describe('json-utils', () => {
  const TestSchema = z.object({
    keyFindings: z.array(z.string()),
    suspectedComponents: z.array(z.string()),
    confidence: z.number().min(0).max(1),
    timelineSummary: z.string(),
    reasoning: z.string(),
  });

  const RcaSchema = z.object({
    probableCause: z.string(),
    confidence: z.number().min(0).max(1),
    supportingContext: z.string(),
    recommendedActions: z.array(
      z.object({
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
      }),
    ),
  });

  it('a. handles Plain JSON', () => {
    const raw = `{"keyFindings":["f1"],"suspectedComponents":["c1"],"confidence":0.9,"timelineSummary":"t1","reasoning":"r1"}`;
    const result = parseAndValidateLlmJson(raw, TestSchema);
    expect(result).toBeDefined();
    expect(result?.confidence).toBe(999); // DELIBERATE BREAKAGE — CI failure proof, will be reverted
  });

  it('b. handles ```json ... ``` markdown fenced JSON', () => {
    const raw = `\`\`\`json\n{"keyFindings":["f1"],"suspectedComponents":["c1"],"confidence":0.9,"timelineSummary":"t1","reasoning":"r1"}\n\`\`\``;
    const result = parseAndValidateLlmJson(raw, TestSchema);
    expect(result).toBeDefined();
    expect(result?.keyFindings).toEqual(['f1']);
  });

  it('c. handles ``` ... ``` fenced JSON', () => {
    const raw = `\`\`\`\n{"keyFindings":["f1"],"suspectedComponents":["c1"],"confidence":0.9,"timelineSummary":"t1","reasoning":"r1"}\n\`\`\``;
    const result = parseAndValidateLlmJson(raw, TestSchema);
    expect(result).toBeDefined();
  });

  it('d. handles leading/trailing conversational text around JSON', () => {
    const raw = `Here is the analysis:\n\`\`\`json\n{"keyFindings":["f1"],"suspectedComponents":["c1"],"confidence":0.9,"timelineSummary":"t1","reasoning":"r1"}\n\`\`\`\nHope this helps!`;
    const result = parseAndValidateLlmJson(raw, TestSchema);
    expect(result).toBeDefined();
  });

  it('e. handles snake_case -> camelCase field names', () => {
    const raw = `{"key_findings":["f1"],"suspected_components":["c1"],"confidence":0.9,"timeline_summary":"t1","reasoning":"r1"}`;
    const result = parseAndValidateLlmJson(raw, TestSchema);
    expect(result).toBeDefined();
    expect(result?.keyFindings).toEqual(['f1']);
    expect(result?.suspectedComponents).toEqual(['c1']);
    expect(result?.timelineSummary).toBe('t1');
  });

  it('f. handles confidence 0-100 scale', () => {
    const raw = `{"keyFindings":["f1"],"suspectedComponents":["c1"],"confidence":85,"timelineSummary":"t1","reasoning":"r1"}`;
    const result = parseAndValidateLlmJson(raw, TestSchema);
    expect(result).toBeDefined();
    expect(result?.confidence).toBe(0.85);
  });

  it('g. handles textual confidence values ("High" -> 0.85)', () => {
    const raw = `{"keyFindings":["f1"],"suspectedComponents":["c1"],"confidence":"High","timelineSummary":"t1","reasoning":"r1"}`;
    const result = parseAndValidateLlmJson(raw, TestSchema);
    expect(result).toBeDefined();
    expect(result?.confidence).toBe(0.85);
  });

  it('h. handles enum values in lowercase/snake_case', () => {
    const raw = `{"probable_cause":"Bad deployment","confidence":0.9,"supporting_context":"context","recommended_actions":[{"action_type":"rollback_deployment","service_id":"s1","rationale":"rat","estimated_risk":"low","requires_approval":"true"}]}`;
    const result = parseAndValidateLlmJson(raw, RcaSchema);
    expect(result).toBeDefined();
    expect(result?.recommendedActions[0]?.actionType).toBe('ROLLBACK_DEPLOYMENT');
    expect(result?.recommendedActions[0]?.estimatedRisk).toBe('LOW');
    expect(result?.recommendedActions[0]?.requiresApproval).toBe(true);
  });

  it('i. handles problematic Upstage Investigation response', () => {
    const raw = JSON.stringify({
      "Investigation Findings": {
        "Key Findings": [
          "High CPU Utilization: Fraud Engine",
          "P99 Latency Degradation: Fraud Engine"
        ],
        "Suspected Components": [
          {
            "Component": "Fraud Engine",
            "Confidence": "High",
            "Reason": "The evidence items directly point to the Fraud Engine."
          }
        ],
        "Confidence Level": "High",
        "Timeline Summary": [
          {
            "Timestamp": "Unknown",
            "Event": "High CPU Utilization: Fraud Engine",
            "Description": "CPU utilization breached the threshold."
          }
        ]
      }
    });

    const result = parseAndValidateLlmJson(raw, TestSchema);
    expect(result).toBeDefined();
    expect(result?.keyFindings).toContain("High CPU Utilization: Fraud Engine");
    expect(result?.suspectedComponents).toContain("Fraud Engine");
    expect(result?.confidence).toBe(0.85);
    expect(result?.timelineSummary).toContain("Fraud Engine");
  });

  it('j. handles problematic Upstage RCA response', () => {
    const raw = JSON.stringify({
      "root_cause": "Bad Deployment",
      "recommendation": "ROLLBACK_DEPLOYMENT",
      "risk_estimation": "Low",
      "rationale": "The incident is correlated with a recent deployment.",
      "rollback_steps": [],
      "post_rollback_actions": []
    });

    const result = parseAndValidateLlmJson(raw, RcaSchema);
    expect(result).toBeDefined();
    expect(result?.probableCause).toBe("Bad Deployment");
    expect(result?.recommendedActions[0]?.actionType).toBe("ROLLBACK_DEPLOYMENT");
    expect(result?.recommendedActions[0]?.estimatedRisk).toBe("LOW");
  });

  it('k. returns undefined when schema validation genuinely fails on unrelated invalid JSON', () => {
    const raw = `{"unrelated_key": "unrelated_value"}`;
    const result = parseAndValidateLlmJson(raw, TestSchema, 'TestSchema');
    expect(result).toBeUndefined();
  });
});
