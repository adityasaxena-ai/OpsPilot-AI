import type { ZodSchema } from 'zod';

/**
 * Extracts clean JSON string from LLM responses containing markdown code fences
 * (```json ... ``` or ``` ... ```) or conversational intro/outro text.
 */
export function extractJsonString(text: string): string {
  let cleaned = text.trim();

  // 1. Check for markdown code fences (```json ... ``` or ``` ... ```) anywhere in the text
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    cleaned = codeBlockMatch[1].trim();
  } else {
    // 2. Extract between first '{' or '[' and last '}' or ']'
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    let startIdx = -1;

    if (firstBrace !== -1 && firstBracket !== -1) {
      startIdx = Math.min(firstBrace, firstBracket);
    } else if (firstBrace !== -1) {
      startIdx = firstBrace;
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
    }

    if (startIdx !== -1) {
      const lastBrace = cleaned.lastIndexOf('}');
      const lastBracket = cleaned.lastIndexOf(']');
      const endIdx = Math.max(lastBrace, lastBracket);
      if (endIdx > startIdx) {
        cleaned = cleaned.slice(startIdx, endIdx + 1).trim();
      }
    }
  }

  // Strip trailing commas before closing braces/brackets (common LLM syntax variation)
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  return cleaned;
}

/**
 * Maps textual confidence levels ("high", "medium", "low", etc.) or numbers/strings to a 0.0..1.0 float.
 */
function normalizeConfidence(conf: unknown): number | undefined {
  if (conf === undefined || conf === null) return undefined;

  if (typeof conf === 'number') {
    if (isNaN(conf)) return undefined;
    if (conf > 1.0 && conf <= 100) return Math.min(Math.max(conf / 100, 0), 1);
    return Math.min(Math.max(conf, 0), 1);
  }

  if (typeof conf === 'string') {
    const s = conf.toLowerCase().trim();
    if (s === 'critical' || s === 'very high' || s === 'very_high') return 0.95;
    if (s === 'high') return 0.85;
    if (s === 'medium' || s === 'moderate') return 0.65;
    if (s === 'low') return 0.45;
    if (s === 'very low' || s === 'very_low' || s === 'minor') return 0.25;

    const num = parseFloat(s.replace('%', ''));
    if (!isNaN(num)) {
      if (num > 1.0 && num <= 100) return Math.min(Math.max(num / 100, 0), 1);
      return Math.min(Math.max(num, 0), 1);
    }
  }

  return undefined;
}

/**
 * Normalizes action types into expected uppercase enum strings.
 */
function normalizeActionType(actionStr: unknown): string {
  if (typeof actionStr !== 'string') return 'RESTART_SERVICE';
  const act = actionStr.toUpperCase().trim();

  if (act.includes('ROLLBACK')) return 'ROLLBACK_DEPLOYMENT';
  if (act.includes('RESTART')) return 'RESTART_SERVICE';
  if (act.includes('SCALE')) return 'SCALE_SERVICE';
  if (act.includes('CACHE')) return 'CLEAR_CACHE';
  if (act.includes('RETRY')) return 'RETRY_BATCH';

  return 'RESTART_SERVICE';
}

/**
 * Normalizes risk estimation strings to 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'.
 */
function normalizeRisk(riskStr: unknown): string {
  if (typeof riskStr !== 'string') return 'LOW';
  const r = riskStr.toUpperCase().trim();
  if (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(r)) return r;
  return 'LOW';
}

/**
 * Recursively normalizes LLM JSON output structures.
 */
export function normalizeLlmObject(val: unknown): unknown {
  if (val === null || val === undefined) return val;

  if (Array.isArray(val)) {
    return val.map((item) => normalizeLlmObject(item));
  }

  if (typeof val !== 'object') {
    return val;
  }

  let src = val as Record<string, unknown>;

  // 1. Unwrap top-level single-key wrappers if LLM wrapped response
  // e.g. { "Investigation Findings": { ... } } or { "data": { ... } }
  const topKeys = Object.keys(src);
  if (topKeys.length === 1) {
    const singleKey = topKeys[0]!;
    const singleVal = src[singleKey];
    if (
      singleVal &&
      typeof singleVal === 'object' &&
      !Array.isArray(singleVal) &&
      (singleKey.toLowerCase().includes('investigation') ||
        singleKey.toLowerCase().includes('triage') ||
        singleKey.toLowerCase().includes('rca') ||
        singleKey.toLowerCase().includes('result') ||
        singleKey.toLowerCase().includes('data') ||
        singleKey.toLowerCase().includes('findings'))
    ) {
      src = singleVal as Record<string, unknown>;
    }
  }

  const res: Record<string, unknown> = {};

  // Key normalization mapping
  for (const [key, value] of Object.entries(src)) {
    const cleanKey = key.trim();
    let newKey = cleanKey;

    const lowerKey = cleanKey.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (lowerKey === 'keyfindings' || lowerKey === 'findings') newKey = 'keyFindings';
    else if (lowerKey === 'suspectedcomponents' || lowerKey === 'components' || lowerKey === 'suspectedservices') newKey = 'suspectedComponents';
    else if (lowerKey === 'confidence' || lowerKey === 'confidencelevel') newKey = 'confidence';
    else if (lowerKey === 'timelinesummary' || lowerKey === 'timeline') newKey = 'timelineSummary';
    else if (lowerKey === 'reasoning' || lowerKey === 'rationale') newKey = 'reasoning';
    else if (lowerKey === 'probablecause' || lowerKey === 'rootcause' || lowerKey === 'cause') newKey = 'probableCause';
    else if (lowerKey === 'supportingcontext' || lowerKey === 'context') newKey = 'supportingContext';
    else if (lowerKey === 'recommendedactions' || lowerKey === 'actions') newKey = 'recommendedActions';
    else if (lowerKey === 'actiontype' || lowerKey === 'action' || lowerKey === 'recommendation') newKey = 'actionType';
    else if (lowerKey === 'serviceid' || lowerKey === 'service') newKey = 'serviceId';
    else if (lowerKey === 'estimatedrisk' || lowerKey === 'risk' || lowerKey === 'riskestimation') newKey = 'estimatedRisk';
    else if (lowerKey === 'requiresapproval' || lowerKey === 'approvalrequired') newKey = 'requiresApproval';
    else if (lowerKey === 'affectedservice' || lowerKey === 'servicename') newKey = 'affectedService';
    else if (lowerKey === 'businessimpact') newKey = 'businessImpact';
    else if (lowerKey === 'recommendednextstep' || lowerKey === 'nextstep') newKey = 'recommendedNextStep';
    else if (lowerKey === 'detectionmethod') newKey = 'detectionMethod';
    else if (lowerKey === 'remediationsummary') newKey = 'remediationSummary';
    else if (lowerKey === 'preventiveactions' || lowerKey === 'preventativeactions') newKey = 'preventiveActions';
    else if (cleanKey.includes('_')) {
      newKey = cleanKey.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    }

    res[newKey] = normalizeLlmObject(value);
  }

  // 2. Normalize confidence
  const confVal = res.confidence ?? src['Confidence Level'] ?? src['confidence_level'];
  const normConf = normalizeConfidence(confVal);
  if (normConf !== undefined) {
    res.confidence = normConf;
  } else if (res.confidence === undefined) {
    // If confidence is completely missing from LLM response, default to 0.85
    res.confidence = 0.85;
  }

  // 3. Normalize severity
  if (typeof res.severity === 'string') {
    const sevStr = res.severity.toUpperCase().trim();
    if (['P1', 'P2', 'P3', 'P4', 'P5'].includes(sevStr)) {
      res.severity = sevStr;
    } else if (sevStr.includes('CRITICAL') || sevStr.includes('SEV-1') || sevStr.includes('SEV1')) {
      res.severity = 'P1';
    } else if (sevStr.includes('HIGH') || sevStr.includes('SEV-2') || sevStr.includes('SEV2')) {
      res.severity = 'P2';
    } else if (sevStr.includes('MEDIUM') || sevStr.includes('SEV-3') || sevStr.includes('SEV3')) {
      res.severity = 'P3';
    } else if (sevStr.includes('LOW') || sevStr.includes('SEV-4') || sevStr.includes('SEV4')) {
      res.severity = 'P4';
    } else if (sevStr.includes('MINOR') || sevStr.includes('SEV-5') || sevStr.includes('SEV5')) {
      res.severity = 'P5';
    }
  }

  // 4. Normalize impact
  if (typeof res.impact === 'string') {
    res.impact = res.impact.toUpperCase();
  }

  // 5. Handle Investigation Output Schema specific fields
  if (!res.keyFindings && res.findings) {
    res.keyFindings = res.findings;
  }
  if (typeof res.keyFindings === 'string') {
    res.keyFindings = [res.keyFindings];
  }
  if (Array.isArray(res.keyFindings)) {
    res.keyFindings = res.keyFindings.map((item) =>
      typeof item === 'string'
        ? item
        : typeof item === 'object' && item !== null
          ? (item as Record<string, unknown>).finding ||
            (item as Record<string, unknown>).Event ||
            (item as Record<string, unknown>).title ||
            JSON.stringify(item)
          : String(item),
    );
  }

  if (!res.suspectedComponents && res.components) {
    res.suspectedComponents = res.components;
  }
  if (typeof res.suspectedComponents === 'string') {
    res.suspectedComponents = [res.suspectedComponents];
  }
  if (Array.isArray(res.suspectedComponents)) {
    res.suspectedComponents = res.suspectedComponents.map((item) =>
      typeof item === 'string'
        ? item
        : typeof item === 'object' && item !== null
          ? (item as Record<string, unknown>).Component ||
            (item as Record<string, unknown>).component ||
            (item as Record<string, unknown>).name ||
            JSON.stringify(item)
          : String(item),
    );
  }

  if (Array.isArray(res.timelineSummary)) {
    res.timelineSummary = res.timelineSummary
      .map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item !== null) {
          const tObj = item as Record<string, unknown>;
          const evt = tObj.Event || tObj.event || tObj.title || '';
          const desc = tObj.Description || tObj.description || '';
          const ts = tObj.Timestamp || tObj.timestamp || '';
          const parts = [ts, evt, desc].filter(Boolean);
          return parts.join(' - ');
        }
        return String(item);
      })
      .filter(Boolean)
      .join('\n');
  }

  if (!res.reasoning) {
    if (typeof res.probableCause === 'string') res.reasoning = res.probableCause;
    else if (typeof res.timelineSummary === 'string') res.reasoning = res.timelineSummary;
  }

  // 6. Handle RCA Output Schema specific fields
  if (!res.probableCause && res.rootCause) {
    res.probableCause = res.rootCause;
  }
  if (!res.probableCause && res.root_cause) {
    res.probableCause = res.root_cause as string;
  }

  if (!res.supportingContext) {
    if (typeof res.rationale === 'string') res.supportingContext = res.rationale;
    else if (typeof res.reasoning === 'string') res.supportingContext = res.reasoning;
    else if (typeof res.probableCause === 'string') res.supportingContext = res.probableCause;
  }

  const rootActionType = res.actionType ?? src.recommendation ?? src.action;
  if (!res.recommendedActions && rootActionType) {
    res.recommendedActions = [
      {
        actionType: normalizeActionType(rootActionType),
        serviceId: (res.serviceId as string) || '',
        rationale: (res.rationale as string) || (res.supportingContext as string) || (res.probableCause as string) || 'Remediation action recommended by AI',
        estimatedRisk: normalizeRisk(res.estimatedRisk || src.risk_estimation || src.risk),
        requiresApproval: res.requiresApproval !== undefined ? Boolean(res.requiresApproval) : true,
      },
    ];
  }

  if (Array.isArray(res.recommendedActions)) {
    res.recommendedActions = res.recommendedActions.map((item) => {
      if (typeof item !== 'object' || item === null) {
        return {
          actionType: normalizeActionType(item),
          serviceId: '',
          rationale: 'Remediation action recommended by AI',
          estimatedRisk: 'LOW',
          requiresApproval: true,
        };
      }
      const actObj = item as Record<string, unknown>;
      return {
        actionType: normalizeActionType(actObj.actionType || actObj.action_type || actObj.action || actObj.recommendation),
        serviceId: String(actObj.serviceId || actObj.service_id || actObj.service || ''),
        rationale: String(actObj.rationale || actObj.reason || actObj.description || 'Remediation action recommended by AI'),
        estimatedRisk: normalizeRisk(actObj.estimatedRisk || actObj.estimated_risk || actObj.risk),
        requiresApproval: actObj.requiresApproval !== undefined ? Boolean(actObj.requiresApproval) : actObj.requires_approval !== undefined ? Boolean(actObj.requires_approval) : true,
      };
    });
  }

  // 7. Handle Postmortem Output Schema specific fields
  if (!res.preventiveActions && res.preventativeActions) {
    res.preventiveActions = res.preventativeActions;
  }
  if (typeof res.preventiveActions === 'string') {
    res.preventiveActions = [res.preventiveActions];
  }
  if (Array.isArray(res.preventiveActions)) {
    res.preventiveActions = res.preventiveActions.map((item) => (typeof item === 'string' ? item : String(item)));
  }

  return res;
}

/**
 * Extracts, parses, normalizes, and validates JSON against Zod schema.
 */
export function parseAndValidateLlmJson<T>(
  text: string,
  schema: ZodSchema<T>,
  schemaName?: string,
): T | undefined {
  try {
    const jsonStr = extractJsonString(text);
    const rawParsed = JSON.parse(jsonStr);
    const normalized = normalizeLlmObject(rawParsed);
    return schema.parse(normalized);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[AI] Zod validation failed for ${schemaName ?? 'schema'}:`, msg);
    return undefined;
  }
}
