import type { FastifyPluginAsync } from 'fastify';
import type { AssetType, LifecycleStage, RiskLevel } from '@prisma/client';
import { evaluateGovernancePolicy } from '@opspilot/policy-engine';
import { calculateGovernanceRisk } from '@opspilot/risk-engine';
import { db } from '../../lib/db.js';
import { requirePermission } from '../auth/auth.middleware.js';

async function getValidUserId(actorId: string | undefined): Promise<string | undefined> {
  if (!actorId) return undefined;
  const user = await db.user.findFirst({
    where: { OR: [{ id: actorId }, { email: actorId }] },
    select: { id: true },
  });
  return user ? user.id : undefined;
}

export const governanceRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/governance/assets — List governed assets with optional filters
  app.get<{
    Querystring: {
      assetType?: AssetType;
      lifecycleStage?: LifecycleStage;
      riskLevel?: RiskLevel;
    };
  }>('/assets', { preHandler: requirePermission('GOVERNANCE_VIEW') }, async (request) => {
    const { assetType, lifecycleStage, riskLevel } = request.query;

    const assets = await db.governedAsset.findMany({
      where: {
        ...(assetType && { assetType }),
        ...(lifecycleStage && { lifecycleStage }),
        ...(riskLevel && { riskLevel }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            riskAssessments: true,
            approvals: true,
          },
        },
      },
    });

    return { success: true, data: assets };
  });

  // POST /api/v1/governance/assets — Create a new GovernedAsset
  app.post<{
    Body: {
      name: string;
      assetType: AssetType;
      description: string;
      ownerTeam: string;
      ownerEmail: string;
      purpose: string;
      isProductionFacing?: boolean;
      dataSensitivity?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED_PII';
    };
  }>('/assets', { preHandler: requirePermission('GOVERNANCE_MANAGE') }, async (request, reply) => {
    const { name, assetType, description, ownerTeam, ownerEmail, purpose, isProductionFacing, dataSensitivity } = request.body ?? {};

    if (!name || !assetType || !description || !ownerTeam || !ownerEmail || !purpose) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'MISSING_PARAM',
          message: 'name, assetType, description, ownerTeam, ownerEmail, and purpose are required',
        },
      });
    }

    const validAssetTypes: AssetType[] = ['MODEL', 'AGENT', 'PROMPT', 'KNOWLEDGE_SOURCE'];
    if (!validAssetTypes.includes(assetType)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_ASSET_TYPE',
          message: `assetType must be one of: ${validAssetTypes.join(', ')}`,
        },
      });
    }

    const actorId = request.user?.subject;
    const actorDisplayName = request.user?.displayName;
    const validUserId = await getValidUserId(actorId);

    // Compute initial governance risk assessment
    const initialRisk = calculateGovernanceRisk({
      assetType,
      isProductionFacing: isProductionFacing ?? false,
      dataSensitivity: dataSensitivity ?? 'INTERNAL',
    });

    // Create GovernedAsset
    const asset = await db.governedAsset.create({
      data: {
        name,
        assetType,
        description,
        ownerTeam,
        ownerEmail,
        purpose,
        lifecycleStage: 'PROPOSED',
        riskLevel: initialRisk.riskLevel,
      },
    });

    // Create initial GovernanceRiskAssessment
    await db.governanceRiskAssessment.create({
      data: {
        governedAssetId: asset.id,
        riskScore: initialRisk.riskScore,
        riskLevel: initialRisk.riskLevel,
        assessedBySubject: actorId ?? null,
        ...(validUserId ? { assessedById: validUserId } : {}),
        fairnessNotes: 'Initial baseline risk assessment on asset creation.',
      },
    });

    // Log to AuditLog
    await db.auditLog.create({
      data: {
        ...(validUserId ? { actorId: validUserId } : {}),
        actorType: 'USER',
        action: 'CREATE_GOVERNED_ASSET',
        targetType: 'governed_asset',
        targetId: asset.id,
        riskScore: initialRisk.riskScore,
        metadata: {
          actorSubject: actorId ?? null,
          actorDisplayName: actorDisplayName ?? null,
          assetName: asset.name,
          assetType: asset.assetType,
          lifecycleStage: asset.lifecycleStage,
          riskLevel: asset.riskLevel,
        },
      },
    });

    return reply.status(201).send({ success: true, data: asset });
  });

  // GET /api/v1/governance/assets/:id — Detail view of a GovernedAsset
  app.get<{ Params: { id: string } }>(
    '/assets/:id',
    { preHandler: requirePermission('GOVERNANCE_VIEW') },
    async (request, reply) => {
      const assetId = request.params.id;

      const asset = await db.governedAsset.findUnique({
        where: { id: assetId },
        include: {
          riskAssessments: {
            orderBy: { createdAt: 'desc' },
          },
          approvals: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!asset) {
        return reply.status(404).send({
          success: false,
          error: { code: 'ASSET_NOT_FOUND', message: `Governed asset with id '${assetId}' not found` },
        });
      }

      return { success: true, data: asset };
    }
  );

  // POST /api/v1/governance/assets/:id/risk-assessment — Perform a risk assessment
  app.post<{
    Params: { id: string };
    Body: {
      fairnessNotes?: string;
      transparencyNotes?: string;
      privacyNotes?: string;
      accountabilityNotes?: string;
      reliabilityNotes?: string;
      securityNotes?: string;
      isProductionFacing?: boolean;
      dataSensitivity?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED_PII';
      historicalIncidentsCount?: number;
    };
  }>(
    '/assets/:id/risk-assessment',
    { preHandler: requirePermission('GOVERNANCE_MANAGE') },
    async (request, reply) => {
      const assetId = request.params.id;
      const asset = await db.governedAsset.findUnique({ where: { id: assetId } });

      if (!asset) {
        return reply.status(404).send({
          success: false,
          error: { code: 'ASSET_NOT_FOUND', message: `Governed asset with id '${assetId}' not found` },
        });
      }

      const body = request.body ?? {};
      const actorId = request.user?.subject;
      const actorDisplayName = request.user?.displayName;
      const validUserId = await getValidUserId(actorId);

      const riskResult = calculateGovernanceRisk({
        assetType: asset.assetType,
        isProductionFacing: body.isProductionFacing ?? false,
        dataSensitivity: body.dataSensitivity ?? 'INTERNAL',
        historicalIncidentsCount: body.historicalIncidentsCount ?? 0,
      });

      const assessment = await db.governanceRiskAssessment.create({
        data: {
          governedAssetId: asset.id,
          fairnessNotes: body.fairnessNotes ?? null,
          transparencyNotes: body.transparencyNotes ?? null,
          privacyNotes: body.privacyNotes ?? null,
          accountabilityNotes: body.accountabilityNotes ?? null,
          reliabilityNotes: body.reliabilityNotes ?? null,
          securityNotes: body.securityNotes ?? null,
          riskScore: riskResult.riskScore,
          riskLevel: riskResult.riskLevel,
          assessedBySubject: actorId ?? null,
          ...(validUserId ? { assessedById: validUserId } : {}),
        },
      });

      // Update asset risk level
      await db.governedAsset.update({
        where: { id: asset.id },
        data: { riskLevel: riskResult.riskLevel },
      });

      // Log to AuditLog
      await db.auditLog.create({
        data: {
          ...(validUserId ? { actorId: validUserId } : {}),
          actorType: 'USER',
          action: 'ASSESS_GOVERNANCE_RISK',
          targetType: 'governed_asset',
          targetId: asset.id,
          riskScore: riskResult.riskScore,
          metadata: {
            actorSubject: actorId ?? null,
            actorDisplayName: actorDisplayName ?? null,
            assessmentId: assessment.id,
            riskScore: riskResult.riskScore,
            riskLevel: riskResult.riskLevel,
            explanation: riskResult.explanation,
          },
        },
      });

      return reply.status(201).send({ success: true, data: assessment });
    }
  );

  // POST /api/v1/governance/assets/:id/lifecycle — Request a lifecycle transition
  app.post<{
    Params: { id: string };
    Body: {
      targetStage: LifecycleStage;
    };
  }>(
    '/assets/:id/lifecycle',
    { preHandler: requirePermission('GOVERNANCE_MANAGE') },
    async (request, reply) => {
      const assetId = request.params.id;
      const { targetStage } = request.body ?? {};

      if (!targetStage) {
        return reply.status(400).send({
          success: false,
          error: { code: 'MISSING_PARAM', message: 'targetStage is required' },
        });
      }

      const validStages: LifecycleStage[] = ['PROPOSED', 'EVALUATED', 'APPROVED', 'LIVE', 'UNDER_REVIEW', 'RETIRED'];
      if (!validStages.includes(targetStage)) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_LIFECYCLE_STAGE',
            message: `targetStage must be one of: ${validStages.join(', ')}`,
          },
        });
      }

      const asset = await db.governedAsset.findUnique({ where: { id: assetId } });
      if (!asset) {
        return reply.status(404).send({
          success: false,
          error: { code: 'ASSET_NOT_FOUND', message: `Governed asset with id '${assetId}' not found` },
        });
      }

      const actorId = request.user?.subject;
      const actorDisplayName = request.user?.displayName;
      const validUserId = await getValidUserId(actorId);

      // Fetch active governance policies
      const policies = await db.governancePolicy.findMany({
        where: { isActive: true },
      });

      const policyEval = evaluateGovernancePolicy(
        {
          assetType: asset.assetType,
          currentStage: asset.lifecycleStage,
          targetStage,
        },
        policies
      );

      if (policyEval.requiresApproval) {
        // Create pending GovernanceApproval row and keep asset stage unchanged
        const approval = await db.governanceApproval.create({
          data: {
            governedAssetId: asset.id,
            targetStage,
            status: 'PENDING',
            requestedBySubject: actorId ?? null,
            ...(validUserId ? { requestedById: validUserId } : {}),
          },
        });

        await db.auditLog.create({
          data: {
            ...(validUserId ? { actorId: validUserId } : {}),
            actorType: 'USER',
            action: 'REQUEST_GOVERNANCE_LIFECYCLE_APPROVAL',
            targetType: 'governed_asset',
            targetId: asset.id,
            approvalId: approval.id,
            metadata: {
              actorSubject: actorId ?? null,
              actorDisplayName: actorDisplayName ?? null,
              currentStage: asset.lifecycleStage,
              targetStage,
              approvalId: approval.id,
              policyReason: policyEval.reason,
            },
          },
        });

        return reply.status(200).send({
          success: true,
          data: {
            asset,
            approvalRequired: true,
            approval,
            reason: policyEval.reason,
          },
        });
      }

      // Auto-approve: transition asset stage immediately
      const previousStage = asset.lifecycleStage;
      const updatedAsset = await db.governedAsset.update({
        where: { id: asset.id },
        data: { lifecycleStage: targetStage },
      });

      await db.auditLog.create({
        data: {
          ...(validUserId ? { actorId: validUserId } : {}),
          actorType: 'USER',
          action: 'TRANSITION_GOVERNANCE_LIFECYCLE_STAGE',
          targetType: 'governed_asset',
          targetId: asset.id,
          metadata: {
            actorSubject: actorId ?? null,
            actorDisplayName: actorDisplayName ?? null,
            previousStage,
            newStage: targetStage,
            autoApproved: true,
            policyReason: policyEval.reason,
          },
        },
      });

      return {
        success: true,
        data: {
          asset: updatedAsset,
          approvalRequired: false,
          reason: policyEval.reason,
        },
      };
    }
  );

  // POST /api/v1/governance/approvals/:id/approve — Approve a pending lifecycle transition
  app.post<{ Params: { id: string } }>(
    '/approvals/:id/approve',
    { preHandler: requirePermission('GOVERNANCE_APPROVE') },
    async (request, reply) => {
      const approvalId = request.params.id;

      const approval = await db.governanceApproval.findUnique({
        where: { id: approvalId },
        include: { asset: true },
      });

      if (!approval) {
        return reply.status(404).send({
          success: false,
          error: { code: 'APPROVAL_NOT_FOUND', message: `Governance approval with id '${approvalId}' not found` },
        });
      }

      if (approval.status !== 'PENDING') {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_APPROVAL_STATE',
            message: `Approval '${approvalId}' is not PENDING (current status: ${approval.status})`,
          },
        });
      }

      const actorId = request.user?.subject;
      const actorDisplayName = request.user?.displayName;
      const validUserId = await getValidUserId(actorId);

      // Update approval
      const updatedApproval = await db.governanceApproval.update({
        where: { id: approvalId },
        data: {
          status: 'APPROVED',
          approvedBySubject: actorId ?? null,
          ...(validUserId ? { approvedById: validUserId } : {}),
          respondedAt: new Date(),
        },
      });

      // Update asset stage
      const previousStage = approval.asset.lifecycleStage;
      const updatedAsset = await db.governedAsset.update({
        where: { id: approval.governedAssetId },
        data: { lifecycleStage: approval.targetStage },
      });

      // Log to AuditLog
      await db.auditLog.create({
        data: {
          ...(validUserId ? { actorId: validUserId } : {}),
          actorType: 'USER',
          action: 'APPROVE_GOVERNANCE_LIFECYCLE_TRANSITION',
          targetType: 'governed_asset',
          targetId: approval.governedAssetId,
          approvalId: approval.id,
          metadata: {
            actorSubject: actorId ?? null,
            actorDisplayName: actorDisplayName ?? null,
            previousStage,
            newStage: approval.targetStage,
            approvedBySubject: actorId ?? null,
            ...(actorId ? { approvedBy: actorId } : {}),
          },
        },
      });

      return {
        success: true,
        data: {
          approval: updatedApproval,
          asset: updatedAsset,
        },
      };
    }
  );

  // POST /api/v1/governance/approvals/:id/reject — Reject a pending lifecycle transition
  app.post<{ Params: { id: string }; Body: { rejectionReason?: string } }>(
    '/approvals/:id/reject',
    { preHandler: requirePermission('GOVERNANCE_APPROVE') },
    async (request, reply) => {
      const approvalId = request.params.id;
      const { rejectionReason } = request.body ?? {};

      const approval = await db.governanceApproval.findUnique({
        where: { id: approvalId },
        include: { asset: true },
      });

      if (!approval) {
        return reply.status(404).send({
          success: false,
          error: { code: 'APPROVAL_NOT_FOUND', message: `Governance approval with id '${approvalId}' not found` },
        });
      }

      if (approval.status !== 'PENDING') {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_APPROVAL_STATE',
            message: `Approval '${approvalId}' is not PENDING (current status: ${approval.status})`,
          },
        });
      }

      const actorId = request.user?.subject;
      const actorDisplayName = request.user?.displayName;
      const validUserId = await getValidUserId(actorId);

      // Update approval
      const updatedApproval = await db.governanceApproval.update({
        where: { id: approvalId },
        data: {
          status: 'REJECTED',
          approvedBySubject: actorId ?? null,
          ...(validUserId ? { approvedById: validUserId } : {}),
          respondedAt: new Date(),
          rejectionReason: rejectionReason ?? 'Rejected by governance officer',
        },
      });

      // Asset stage remains unchanged
      await db.auditLog.create({
        data: {
          ...(validUserId ? { actorId: validUserId } : {}),
          actorType: 'USER',
          action: 'REJECT_GOVERNANCE_LIFECYCLE_TRANSITION',
          targetType: 'governed_asset',
          targetId: approval.governedAssetId,
          approvalId: approval.id,
          metadata: {
            actorSubject: actorId ?? null,
            actorDisplayName: actorDisplayName ?? null,
            currentStage: approval.asset.lifecycleStage,
            rejectedTargetStage: approval.targetStage,
            rejectedBySubject: actorId ?? null,
            ...(actorId ? { rejectedBy: actorId } : {}),
            rejectionReason: updatedApproval.rejectionReason,
          },
        },
      });

      return {
        success: true,
        data: {
          approval: updatedApproval,
          asset: approval.asset,
        },
      };
    }
  );

  // GET /api/v1/governance/policies — List active governance policies
  app.get('/policies', { preHandler: requirePermission('GOVERNANCE_VIEW') }, async () => {
    const policies = await db.governancePolicy.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: policies };
  });
};
