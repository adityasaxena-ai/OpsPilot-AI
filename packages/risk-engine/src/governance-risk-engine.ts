import type { AssetType, RiskLevel } from '@prisma/client';

export interface GovernanceRiskInput {
  assetType: AssetType;
  isProductionFacing?: boolean;
  dataSensitivity?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED_PII';
  historicalIncidentsCount?: number;
  fairnessNotes?: string;
  transparencyNotes?: string;
  privacyNotes?: string;
  accountabilityNotes?: string;
  reliabilityNotes?: string;
  securityNotes?: string;
}

export interface GovernanceRiskFactors {
  baseAssetTypeRisk: number; // 0-30
  productionFacingRisk: number; // 0-25
  dataSensitivityRisk: number; // 0-25
  incidentHistoryRisk: number; // 0-20
}

export interface GovernanceRiskResult {
  riskScore: number;
  riskLevel: RiskLevel;
  factors: GovernanceRiskFactors;
  explanation: string;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AI GOVERNANCE RISK SCORING FORMULA (Sim 2.0)
 * ─────────────────────────────────────────────────────────────────────────────
 * Calculates an explainable 0-100 risk score and classifies the RiskLevel
 * (LOW, MEDIUM, HIGH, CRITICAL) for a Governed AI Asset based on four weighted factors:
 *
 * 1. Base Asset Type Risk (0–30 pts):
 *    - AGENT: 30 pts (Highest autonomy and action capability)
 *    - MODEL: 25 pts (High potential blast radius if model outputs deviate)
 *    - KNOWLEDGE_SOURCE: 20 pts (RAG data source affects output accuracy)
 *    - PROMPT: 15 pts (System prompt or template steering AI behavior)
 *
 * 2. Production Facing Exposure (0–25 pts):
 *    - Production-facing (true): 25 pts (Direct customer or live system impact)
 *    - Internal/Non-prod (false/undefined): 10 pts (Lower blast radius)
 *
 * 3. Data Sensitivity Level (0–25 pts):
 *    - RESTRICTED_PII: 25 pts (Sensitive personal/financial data exposure risk)
 *    - CONFIDENTIAL: 18 pts (Proprietary corporate data)
 *    - INTERNAL: 10 pts (Internal operational data)
 *    - PUBLIC: 0 pts (Freely available data)
 *
 * 4. Historical Incident & Drift Frequency (0–20 pts):
 *    - 5 pts per historical incident or drift event linked to asset (max 20 pts)
 *    - Defaults gracefully to 0 pts for new assets with no incident history.
 *
 * Total Score = Base Risk + Production Exposure + Data Sensitivity + Incident History
 * Score Classifications:
 *   - > 75: CRITICAL
 *   - > 50: HIGH
 *   - > 25: MEDIUM
 *   - <= 25: LOW
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function calculateGovernanceRisk(input: GovernanceRiskInput): GovernanceRiskResult {
  // Factor 1: Base Asset Type Risk (0-30)
  const ASSET_TYPE_RISK: Record<AssetType, number> = {
    AGENT: 30,
    MODEL: 25,
    KNOWLEDGE_SOURCE: 20,
    PROMPT: 15,
  };
  const baseAssetTypeRisk = ASSET_TYPE_RISK[input.assetType] ?? 15;

  // Factor 2: Production Facing Exposure (0-25)
  const productionFacingRisk = input.isProductionFacing ? 25 : 10;

  // Factor 3: Data Sensitivity (0-25)
  const SENSITIVITY_RISK = {
    RESTRICTED_PII: 25,
    CONFIDENTIAL: 18,
    INTERNAL: 10,
    PUBLIC: 0,
  };
  const sensitivityKey = input.dataSensitivity ?? 'INTERNAL';
  const dataSensitivityRisk = SENSITIVITY_RISK[sensitivityKey] ?? 10;

  // Factor 4: Historical Incident & Drift Frequency (0-20)
  const incidentCount = Math.max(0, input.historicalIncidentsCount ?? 0);
  const incidentHistoryRisk = Math.min(20, incidentCount * 5);

  // Sum total risk score (max 100)
  const riskScore = Math.min(
    100,
    baseAssetTypeRisk + productionFacingRisk + dataSensitivityRisk + incidentHistoryRisk
  );

  // Classify Risk Level
  let riskLevel: RiskLevel = 'LOW';
  if (riskScore > 75) riskLevel = 'CRITICAL';
  else if (riskScore > 50) riskLevel = 'HIGH';
  else if (riskScore > 25) riskLevel = 'MEDIUM';

  const factors: GovernanceRiskFactors = {
    baseAssetTypeRisk,
    productionFacingRisk,
    dataSensitivityRisk,
    incidentHistoryRisk,
  };

  const explanation = `Governance Risk Score: ${riskScore}/100 (${riskLevel}). Asset Type Base (+${baseAssetTypeRisk}), Production Exposure (+${productionFacingRisk}), Data Sensitivity (+${dataSensitivityRisk}), Incident History (+${incidentHistoryRisk}).`;

  return {
    riskScore,
    riskLevel,
    factors,
    explanation,
  };
}
