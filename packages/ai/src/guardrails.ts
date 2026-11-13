export const REQUIRED_GUARDRAILS = ['redactor', 'validator', 'budget'] as const;
export type GuardrailName = (typeof REQUIRED_GUARDRAILS)[number];

export class GuardrailMissingError extends Error {
  constructor(public readonly missing: readonly string[]) {
    super(`LLM guardrails not registered: ${missing.join(', ')}`);
    this.name = 'GuardrailMissingError';
  }
}

const registered = new Set<GuardrailName>();

// Step 0 placeholder (L20). Steps 2-3 replace the name with a typed implementation.
export function registerGuardrail(name: GuardrailName): void {
  registered.add(name);
}

export function resetGuardrails(): void {
  registered.clear();
}

export function assertGuardrailsRegistered(): void {
  const missing = REQUIRED_GUARDRAILS.filter((g) => !registered.has(g));
  if (missing.length > 0) throw new GuardrailMissingError(missing);
}
