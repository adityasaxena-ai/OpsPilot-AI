import { PrismaClient } from '@prisma/client';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RiskFactors {
  businessCriticality: number; // 0–25
  blastRadius: number; // 0–20
  irreversibility: number; // 0–20
  environmentRisk: number; // 0–15
  aiUncertainty: number; // 0–10
  historicalFailureRate: number; // 0–10
}

export interface RiskEvaluationResult {
  riskScore: number;
  riskLevel: RiskLevel;
  factors: RiskFactors;
  explanation: string;
}

export interface RiskEvaluationContext {
  actionType: string;
  serviceId: string;
  environment?: string;
  aiConfidence?: number;
}

const ACTION_IRREVERSIBILITY: Record<string, number> = {
  ROLLBACK_DEPLOYMENT: 5,
  RESTART_SERVICE: 5,
  SCALE_SERVICE: 8,
  CLEAR_CACHE: 3,
  RETRY_BATCH: 2,
};

const ENVIRONMENT_RISK: Record<string, number> = {
  production: 15,
  staging: 8,
  development: 2,
};

export class RiskEngine {
  constructor(private db: PrismaClient) {}

  async calculateRisk(ctx: RiskEvaluationContext): Promise<RiskEvaluationResult> {
    // 1. Fetch Service & Downstream Dependencies
    const service = await this.db.service.findUnique({
      where: { id: ctx.serviceId },
      include: {
        dependedOnBy: true,
      },
    });

    if (!service) {
      throw new Error(`Service ${ctx.serviceId} not found`);
    }

    // 2. Compute Risk Factors
    // Factor 1: Business Criticality (0–25)
    let businessCriticality = 5;
    if (service.tier === 'T1') businessCriticality = 25;
    else if (service.tier === 'T2') businessCriticality = 15;

    // Factor 2: Blast Radius (0–20)
    const dependentCount = service.dependedOnBy.length;
    const blastRadius = Math.min(20, dependentCount * 4);

    // Factor 3: Irreversibility (0–20)
    const irreversibility = ACTION_IRREVERSIBILITY[ctx.actionType] ?? 5;

    // Factor 4: Environment Risk (0–15)
    const env = ctx.environment ?? service.environment ?? 'production';
    const environmentRisk = ENVIRONMENT_RISK[env.toLowerCase()] ?? 15;

    // Factor 5: AI Uncertainty (0–10)
    const confidence = ctx.aiConfidence ?? 0.9;
    const aiUncertainty = Math.round((1 - confidence) * 10);

    // Factor 6: Historical Failure Rate (0–10)
    const pastActions = await this.db.remediationAction.findMany({
      where: {
        actionType: ctx.actionType as never,
        incident: { serviceId: ctx.serviceId },
      },
      take: 10,
    });

    let historicalFailureRate = 0;
    if (pastActions.length > 0) {
      const failed = pastActions.filter((a) => a.status === 'FAILED' || a.status === 'ROLLED_BACK').length;
      historicalFailureRate = Math.round((failed / pastActions.length) * 10);
    }

    // 3. Calculate Total Risk Score (0–100)
    const factors: RiskFactors = {
      businessCriticality,
      blastRadius,
      irreversibility,
      environmentRisk,
      aiUncertainty,
      historicalFailureRate,
    };

    const riskScore = Math.min(
      100,
      businessCriticality + blastRadius + irreversibility + environmentRisk + aiUncertainty + historicalFailureRate,
    );

    // 4. Classify Risk Level
    let riskLevel: RiskLevel = 'LOW';
    if (riskScore > 80) riskLevel = 'CRITICAL';
    else if (riskScore > 60) riskLevel = 'HIGH';
    else if (riskScore > 30) riskLevel = 'MEDIUM';

    // 5. Generate Explanation
    const explanation = `Risk Score: ${riskScore}/100 (${riskLevel}). Factors: Business Criticality (+${businessCriticality}), Blast Radius (+${blastRadius}), Action Irreversibility (+${irreversibility}), Environment (+${environmentRisk}), AI Uncertainty (+${aiUncertainty}), Historical Failures (+${historicalFailureRate}).`;

    return {
      riskScore,
      riskLevel,
      factors,
      explanation,
    };
  }
}
