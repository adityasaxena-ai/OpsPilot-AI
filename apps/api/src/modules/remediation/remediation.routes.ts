import type { FastifyPluginAsync } from 'fastify';
import { RemediationExecutor } from '@opspilot/remediation';
import { VerificationAgent } from '@opspilot/agents';
import { getConfig } from '@opspilot/config';
import { db } from '../../lib/db.js';
import { requirePermission } from '../auth/auth.middleware.js';

function isV2Enabled(): boolean {
  return Boolean(getConfig().ENABLE_REMEDIATION_V2);
}

export const remediationRoutes: FastifyPluginAsync = async (app) => {
  const executor = new RemediationExecutor(db);
  const verifier = new VerificationAgent(db);

  // GET /api/v1/remediation — List remediation actions
  app.get('/', async () => {
    const actions = await db.remediationAction.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        incident: { select: { title: true, severity: true, environment: true } },
        approval: true,
      },
    });

    return { success: true, data: actions };
  });

  // GET /api/v1/remediation/policies — List active policies
  app.get('/policies', async () => {
    const policies = await db.policy.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: policies };
  });

  // GET /api/v1/remediation/action-preview/:id — Get crisp action preview data for UI confirmation
  app.get<{ Params: { id: string } }>('/action-preview/:id', async (request, reply) => {
    const actionId = request.params.id;
    try {
      const preview = await executor.getActionPreview(actionId);
      return { success: true, data: preview };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action preview failed';
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: msg } });
    }
  });

  // POST /api/v1/remediation/propose — AI or user proposes a remediation action
  app.post<{
    Body: {
      incidentId: string;
      actionType: string;
      serviceId: string;
      rationale: string;
    };
  }>('/propose', async (request, reply) => {
    const { incidentId, actionType, serviceId, rationale } = request.body;

    if (!incidentId || !actionType) {
      return reply.status(400).send({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'incidentId, actionType required' },
      });
    }

    const incident = await db.incident.findUnique({ where: { id: incidentId } });
    if (!incident) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Incident not found' } });
    }

    const targetService = serviceId ? await db.service.findUnique({ where: { id: serviceId } }) : null;
    const validServiceId = targetService ? targetService.id : incident.serviceId;

    try {
      const result = await executor.proposeAction({
        incidentId,
        actionType,
        serviceId: validServiceId,
        rationale: rationale ?? 'Remediation proposed by OpsPilot AI',
      });

      return { success: true, data: result };
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      const msg = err instanceof Error ? err.message : 'Action proposal failed';
      return reply.status(statusCode).send({ success: false, error: { code: 'PROPOSAL_FAILED', message: msg } });
    }
  });

  // POST /api/v1/remediation/:id/approve — Human operator approves a pending action
  app.post<{ Params: { id: string } }>(
    '/:id/approve',
    { preHandler: requirePermission('REMEDIATION_APPROVE') },
    async (request, reply) => {
    const actionId = request.params.id;

    const action = await db.remediationAction.findUnique({
      where: { id: actionId },
      include: { approval: true, incident: true },
    });

    if (!action) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Action not found' } });
    }

    if (action.incident && ['RESOLVED', 'CLOSED'].includes(action.incident.status)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: `[InvalidState] Incident ${action.incidentId} is already ${action.incident.status}. Remediation is disabled.`,
        },
      });
    }

    if (['EXECUTING', 'VERIFYING', 'SUCCEEDED'].includes(action.status)) {
      return reply.status(409).send({
        success: false,
        error: { code: 'CONCURRENCY_CONFLICT', message: `Remediation action ${actionId} is already in state ${action.status}` },
      });
    }

    if (!['AWAITING_APPROVAL', 'PROPOSED'].includes(action.status)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_STATE', message: `Remediation action ${actionId} is in state ${action.status} and cannot be approved.` },
      });
    }

    // Atomic update guard for concurrent execution safety
    const updated = await db.remediationAction.updateMany({
      where: {
        id: actionId,
        status: { in: ['PROPOSED', 'AWAITING_APPROVAL'] },
      },
      data: { status: 'APPROVED' },
    });

    if (updated.count === 0) {
      return reply.status(409).send({
        success: false,
        error: { code: 'CONCURRENCY_CONFLICT', message: `Remediation action ${actionId} is already in state ${action.status}` },
      });
    }

    await db.approval.updateMany({
      where: { remediationActionId: actionId, status: 'PENDING' },
      data: { status: 'APPROVED', respondedAt: new Date() },
    });

    await db.incident.update({
      where: { id: action.incidentId },
      data: { status: 'REMEDIATION_APPROVED' },
    });

    await db.incidentEvent.create({
      data: {
        incidentId: action.incidentId,
        eventType: 'REMEDIATION_APPROVED',
        actorType: 'USER',
        description: `Human operator authorized execution of ${action.actionType} on production target`,
        metadata: { actionId },
      },
    });

    try {
      // Original Sim 1.0 flow: execute post approval immediately
      const operatorId = request.user?.subject || (request.headers['x-operator-id'] as string) || (process.env.NODE_ENV !== 'production' ? 'dev-user-admin' : undefined);
      const execRes = await executor.executeAction(actionId, operatorId);

      // Run recovery verification
      const verifRes = await verifier.verifyRecovery(action.incidentId);

      return {
        success: true,
        data: {
          actionId,
          approvalStatus: 'APPROVED',
          execution: execRes,
          verification: verifRes,
        },
      };
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      const msg = err instanceof Error ? err.message : 'Execution failed';
      return reply.status(statusCode).send({ success: false, error: { code: 'EXECUTION_FAILED', message: msg } });
    }
  });

  // POST /api/v1/remediation/:id/approve-verified — V2 multi-option approve route (marks APPROVED without auto-executing)
  app.post<{ Params: { id: string } }>('/:id/approve-verified', { preHandler: requirePermission('REMEDIATION_EXECUTE') }, async (request, reply) => {
    if (!isV2Enabled()) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Route POST:/api/v1/remediation/:id/approve-verified not found' } });
    }

    const actionId = request.params.id;
    const action = await db.remediationAction.findUnique({
      where: { id: actionId },
      include: { approval: true, incident: true },
    });

    if (!action) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Action not found' } });
    }

    if (!action.successCriteria) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_REMEDIATION_TYPE',
          message: 'Action has no success criteria defined. Use POST /api/v1/remediation/:id/approve for legacy single-action remediation.',
        },
      });
    }

    if (action.incident && ['RESOLVED', 'CLOSED'].includes(action.incident.status)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: `[InvalidState] Incident ${action.incidentId} is already ${action.incident.status}. Remediation is disabled.`,
        },
      });
    }

    if (['EXECUTING', 'VERIFYING', 'SUCCEEDED'].includes(action.status)) {
      return reply.status(409).send({
        success: false,
        error: { code: 'CONCURRENCY_CONFLICT', message: `Remediation action ${actionId} is already in state ${action.status}` },
      });
    }

    if (!['AWAITING_APPROVAL', 'PROPOSED'].includes(action.status)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_STATE', message: `Remediation action ${actionId} is in state ${action.status} and cannot be approved.` },
      });
    }

    // Atomic update guard
    const updated = await db.remediationAction.updateMany({
      where: {
        id: actionId,
        status: { in: ['PROPOSED', 'AWAITING_APPROVAL'] },
      },
      data: { status: 'APPROVED' },
    });

    if (updated.count === 0) {
      return reply.status(409).send({
        success: false,
        error: { code: 'CONCURRENCY_CONFLICT', message: `Remediation action ${actionId} is already in state ${action.status}` },
      });
    }

    await db.approval.updateMany({
      where: { remediationActionId: actionId, status: 'PENDING' },
      data: { status: 'APPROVED', respondedAt: new Date() },
    });

    await db.incident.update({
      where: { id: action.incidentId },
      data: { status: 'REMEDIATION_APPROVED' },
    });

    await db.incidentEvent.create({
      data: {
        incidentId: action.incidentId,
        eventType: 'REMEDIATION_APPROVED',
        actorType: 'USER',
        description: `Human operator authorized execution of ${action.actionType} with success verification criteria`,
        metadata: { actionId, successCriteria: action.successCriteria },
      },
    });

    return {
      success: true,
      data: {
        actionId,
        approvalStatus: 'APPROVED',
      },
    };
  });

  // POST /api/v1/remediation/:id/reject — Human operator rejects a pending action
  app.post<{ Params: { id: string }; Body: { reason?: string } }>('/:id/reject', async (request, reply) => {
    const actionId = request.params.id;
    const { reason } = request.body ?? {};

    const action = await db.remediationAction.findUnique({ where: { id: actionId } });
    if (!action) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Action not found' } });
    }

    await db.remediationAction.update({
      where: { id: actionId },
      data: { status: 'REJECTED' },
    });

    await db.approval.updateMany({
      where: { remediationActionId: actionId, status: 'PENDING' },
      data: { status: 'REJECTED', respondedAt: new Date(), rejectionReason: reason ?? 'Rejected by human operator' },
    });

    await db.incident.update({
      where: { id: action.incidentId },
      data: { status: 'ESCALATED' },
    });

    await db.incidentEvent.create({
      data: {
        incidentId: action.incidentId,
        eventType: 'APPROVAL_REJECTED',
        actorType: 'USER',
        description: `Human operator rejected remediation: ${reason ?? 'Rejected'}`,
        metadata: { actionId, reason },
      },
    });

    return { success: true, data: { actionId, approvalStatus: 'REJECTED' } };
  });

  // ─────────────────────────────────────────────
  // SIM 2.0 REMEDIATION V2 ENDPOINTS (Gated by ENABLE_REMEDIATION_V2)
  // ─────────────────────────────────────────────

  // POST /api/v1/remediation/propose-options — Propose N options (N >= 2) for an incident
  app.post<{
    Body: {
      incidentId: string;
      options: Array<{
        actionType: string;
        serviceId?: string;
        rationale?: string;
        successCriteria: {
          metric: 'errorRatePercent' | 'latencyP99Ms' | 'cpuPercent' | 'isHealthy';
          maxAcceptableValue?: number;
          expectedValue?: boolean;
        };
      }>;
    };
  }>('/propose-options', async (request, reply) => {
    const { getConfig } = await import('@opspilot/config');
    const config = getConfig();
    if (!config.ENABLE_REMEDIATION_V2) {
      return reply.status(404).send({
        message: `Route POST:${request.url} not found`,
        error: 'Not Found',
        statusCode: 404,
      });
    }

    const { incidentId, options } = request.body ?? {};

    if (!incidentId || !options || !Array.isArray(options)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'incidentId and options array are required' },
      });
    }

    if (options.length < 2) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_OPTIONS_COUNT',
          message: 'Multi-option proposal requires at least 2 options. For single proposals, use POST /api/v1/remediation/propose.',
        },
      });
    }

    const incident = await db.incident.findUnique({ where: { id: incidentId }, include: { service: true } });
    if (!incident) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Incident not found' } });
    }

    if (['RESOLVED', 'CLOSED'].includes(incident.status)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_STATE',
          message: `[InvalidState] Incident ${incident.id} is already ${incident.status}. Remediation is disabled.`,
        },
      });
    }

    const optionSetId = `optset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const createdActions = [];

    const { RiskEngine } = await import('@opspilot/risk-engine');
    const { PolicyEngine } = await import('@opspilot/policy-engine');
    const riskEngine = new RiskEngine(db);
    const policyEngine = new PolicyEngine(db);

    for (const opt of options) {
      if (!opt.actionType || !opt.successCriteria) {
        return reply.status(400).send({
          success: false,
          error: { code: 'MISSING_PARAM', message: 'Each option requires actionType and successCriteria' },
        });
      }

      const validServiceId = opt.serviceId ? opt.serviceId : incident.serviceId;

      const riskRes = await riskEngine.calculateRisk({
        actionType: opt.actionType,
        serviceId: validServiceId,
        environment: incident.environment,
      });

      const policyRes = await policyEngine.evaluate({
        actionType: opt.actionType,
        serviceTier: incident.service.tier,
        environment: incident.environment,
        riskScore: riskRes.riskScore,
      });

      let requiresApproval = policyRes.requiresApproval;
      if (incident.environment === 'production' || incident.service.environment === 'production') {
        requiresApproval = true;
      }

      const status = requiresApproval ? 'AWAITING_APPROVAL' : 'APPROVED';

      const action = await db.remediationAction.create({
        data: {
          incidentId,
          remediationOptionSetId: optionSetId,
          actionType: opt.actionType as never,
          status: status as never,
          riskScore: riskRes.riskScore,
          riskLevel: riskRes.riskLevel as never,
          riskFactors: riskRes.factors as never,
          proposedByAi: true,
          proposedAt: new Date(),
          successCriteria: opt.successCriteria as never,
        },
      });

      let approvalId: string | undefined;

      if (requiresApproval) {
        const approval = await db.approval.create({
          data: {
            remediationActionId: action.id,
            incidentId,
            status: 'PENDING',
            aiRecommendation: opt.rationale ?? `Multi-option proposal (${opt.actionType})`,
            riskSummary: riskRes.explanation,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          },
        });
        approvalId = approval.id;
      }

      createdActions.push({
        actionId: action.id,
        actionType: action.actionType,
        status: action.status,
        riskScore: action.riskScore,
        riskLevel: action.riskLevel,
        successCriteria: action.successCriteria,
        approvalId,
      });
    }

    // Log to AuditLog ONCE per option set
    const operatorId = request.user?.subject || (request.headers['x-operator-id'] as string) || null;
    let validUserId: string | null = null;
    if (operatorId) {
      const user = await db.user.findFirst();
      if (user) validUserId = user.id;
    }

    await db.auditLog.create({
      data: {
        action: 'PROPOSE_REMEDIATION_OPTION_SET',
        actorType: operatorId ? 'USER' : 'AI',
        actorId: validUserId,
        targetType: 'remediation_option_set',
        targetId: optionSetId,
        incidentId,
        metadata: {
          optionSetId,
          incidentId,
          optionCount: options.length,
          actionIds: createdActions.map((a) => a.actionId),
        } as never,
      },
    });

    return {
      success: true,
      data: {
        optionSetId,
        incidentId,
        options: createdActions,
      },
    };
  });

  // GET /api/v1/remediation/option-sets/:optionSetId — Return all options in a set side by side
  app.get<{ Params: { optionSetId: string } }>('/option-sets/:optionSetId', async (request, reply) => {
    const { getConfig } = await import('@opspilot/config');
    const config = getConfig();
    if (!config.ENABLE_REMEDIATION_V2) {
      return reply.status(404).send({
        message: `Route GET:${request.url} not found`,
        error: 'Not Found',
        statusCode: 404,
      });
    }

    const { optionSetId } = request.params;
    const actions = await db.remediationAction.findMany({
      where: { remediationOptionSetId: optionSetId },
      orderBy: { createdAt: 'asc' },
      include: {
        approval: true,
        incident: { select: { title: true, severity: true, environment: true } },
      },
    });

    if (actions.length === 0) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: `Option set ${optionSetId} not found` },
      });
    }

    return {
      success: true,
      data: {
        optionSetId,
        incidentId: actions[0]?.incidentId,
        options: actions,
      },
    };
  });

  // POST /api/v1/remediation/:id/execute-verified — Capture baseline, stand down losing options, and execute
  app.post<{ Params: { id: string } }>(
    '/:id/execute-verified',
    { preHandler: requirePermission('REMEDIATION_EXECUTE') },
    async (request, reply) => {
      const { getConfig } = await import('@opspilot/config');
      const config = getConfig();
      if (!config.ENABLE_REMEDIATION_V2) {
        return reply.status(404).send({
          message: `Route POST:${request.url} not found`,
          error: 'Not Found',
          statusCode: 404,
        });
      }

      const actionId = request.params.id;

      const action = await db.remediationAction.findUnique({
        where: { id: actionId },
        include: { incident: { include: { service: { include: { simState: true } } } } },
      });

      if (!action) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Action not found' } });
      }

      if (action.status !== 'APPROVED') {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_STATE',
            message: `Action ${actionId} is in state ${action.status} and must be APPROVED before verified execution.`,
          },
        });
      }

      if (!action.successCriteria) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'MISSING_SUCCESS_CRITERIA',
            message: `Action ${actionId} does not have defined successCriteria. Use POST /api/v1/remediation/:id/execute for plain execution.`,
          },
        });
      }

      // 1. Capture RemediationBaseline before execution
      const simState = action.incident?.service?.simState;
      const baselineMetrics = {
        cpuPercent: simState?.cpuPercent ?? 20,
        errorRatePercent: simState?.errorRatePercent ?? 0.1,
        latencyP99Ms: simState?.latencyP99Ms ?? 150,
        isHealthy: simState?.isHealthy ?? true,
      };

      const baseline = await db.remediationBaseline.upsert({
        where: { remediationActionId: actionId },
        create: {
          remediationActionId: actionId,
          capturedMetrics: baselineMetrics,
        },
        update: {
          capturedMetrics: baselineMetrics,
          capturedAt: new Date(),
        },
      });

      // 2. Stand down losing options in the same optionSetId (transition to SUPERSEDED)
      let supersededCount = 0;
      if (action.remediationOptionSetId) {
        const peerActions = await db.remediationAction.findMany({
          where: {
            remediationOptionSetId: action.remediationOptionSetId,
            id: { not: actionId },
            status: { in: ['PROPOSED', 'AWAITING_APPROVAL', 'APPROVED'] },
          },
        });

        for (const peer of peerActions) {
          await db.remediationAction.update({
            where: { id: peer.id },
            data: { status: 'SUPERSEDED' },
          });

          await db.approval.updateMany({
            where: { remediationActionId: peer.id, status: 'PENDING' },
            data: {
              status: 'REJECTED',
              respondedAt: new Date(),
              rejectionReason: `Superseded by selected option ${actionId}`,
            },
          });

          supersededCount++;
        }
      }

      // 3. Call execution mechanism
      try {
        const operatorId =
          request.user?.subject ||
          (request.headers['x-operator-id'] as string) ||
          (process.env.NODE_ENV !== 'production' ? 'dev-user-admin' : undefined);

        const execRes = await executor.executeAction(actionId, operatorId);

        let validUserId: string | null = null;
        if (operatorId) {
          const user = await db.user.findFirst();
          if (user) validUserId = user.id;
        }

        await db.auditLog.create({
          data: {
            action: 'EXECUTE_VERIFIED_REMEDIATION',
            actorType: operatorId ? 'USER' : 'AI',
            actorId: validUserId,
            targetType: 'REMEDIATION_ACTION',
            targetId: actionId,
            incidentId: action.incidentId,
            result: execRes.success ? 'SUCCESS' : 'FAILURE',
            metadata: {
              actionId,
              optionSetId: action.remediationOptionSetId,
              supersededPeerCount: supersededCount,
              baselineId: baseline.id,
              baselineMetrics,
            } as never,
          },
        });

        return {
          success: true,
          data: {
            actionId,
            execution: execRes,
            baseline: {
              id: baseline.id,
              capturedMetrics: baseline.capturedMetrics,
              capturedAt: baseline.capturedAt,
            },
            supersededPeerCount: supersededCount,
          },
        };
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
        const msg = err instanceof Error ? err.message : 'Execution failed';
        return reply.status(statusCode).send({ success: false, error: { code: 'EXECUTION_FAILED', message: msg } });
      }
    }
  );

  // POST /api/v1/remediation/:id/verify — Compare current metrics against baseline & successCriteria
  app.post<{ Params: { id: string } }>(
    '/:id/verify',
    { preHandler: requirePermission('REMEDIATION_EXECUTE') },
    async (request, reply) => {
      const { getConfig } = await import('@opspilot/config');
      const config = getConfig();
      if (!config.ENABLE_REMEDIATION_V2) {
        return reply.status(404).send({
          message: `Route POST:${request.url} not found`,
          error: 'Not Found',
          statusCode: 404,
        });
      }

      const actionId = request.params.id;

      const action = await db.remediationAction.findUnique({
        where: { id: actionId },
        include: {
          baseline: true,
          incident: { include: { service: { include: { simState: true } } } },
        },
      });

      if (!action) {
        return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Action not found' } });
      }

      if (!action.baseline) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'MISSING_BASELINE',
            message: `Baseline not found for action ${actionId}. Must run execute-verified before outcome verification.`,
          },
        });
      }

      const { evaluateVerificationVerdict } = await import('./remediation-v2.service.js');
      const simState = action.incident?.service?.simState;

      const verdictRes = evaluateVerificationVerdict(
        action.successCriteria as any,
        simState
      );

      const verifiedAt = new Date();

      // Update RemediationAction verification outcome
      const updatedAction = await db.remediationAction.update({
        where: { id: actionId },
        data: {
          verificationVerdict: verdictRes.verdict,
          verifiedAt,
          verificationNotes: verdictRes.notes,
        },
      });

      // If verdict is VERIFIED_SUCCESS, trigger resolution lifecycle
      if (verdictRes.verdict === 'VERIFIED_SUCCESS' && action.incident) {
        const resolvedAt = new Date();
        const detectedAt = action.incident.detectedAt;
        const mttrSeconds = Math.round((resolvedAt.getTime() - detectedAt.getTime()) / 1000);

        await db.incident.update({
          where: { id: action.incidentId },
          data: {
            status: 'RESOLVED',
            resolvedAt,
            mttrSeconds,
          },
        });

        await db.alert.updateMany({
          where: { serviceId: action.incident.serviceId, status: 'ACTIVE' },
          data: { status: 'RESOLVED' },
        });

        await db.incidentEvent.create({
          data: {
            incidentId: action.incidentId,
            eventType: 'VERIFICATION_PASSED',
            actorType: 'AI',
            description: `Verification confirmed success criteria met (${verdictRes.notes}). Incident RESOLVED.`,
            metadata: { verdict: verdictRes.verdict, metrics: verdictRes.currentMetrics } as never,
          },
        });
      } else {
        await db.incidentEvent.create({
          data: {
            incidentId: action.incidentId,
            eventType: verdictRes.verdict === 'VERIFIED_FAILURE' ? 'VERIFICATION_FAILED' : 'VERIFICATION_INCONCLUSIVE',
            actorType: 'AI',
            description: `Outcome verification result: ${verdictRes.verdict}. ${verdictRes.notes}`,
            metadata: { verdict: verdictRes.verdict, metrics: verdictRes.currentMetrics } as never,
          },
        });
      }

      const operatorId =
        request.user?.subject ||
        (request.headers['x-operator-id'] as string) ||
        (process.env.NODE_ENV !== 'production' ? 'dev-user-admin' : undefined);

      let validUserId: string | null = null;
      if (operatorId) {
        const user = await db.user.findFirst();
        if (user) validUserId = user.id;
      }

      await db.auditLog.create({
        data: {
          action: 'VERIFY_REMEDIATION_OUTCOME',
          actorType: operatorId ? 'USER' : 'AI',
          actorId: validUserId,
          targetType: 'REMEDIATION_ACTION',
          targetId: actionId,
          incidentId: action.incidentId,
          result: verdictRes.verdict === 'VERIFIED_SUCCESS' ? 'SUCCESS' : 'FAILURE',
          metadata: {
            actionId,
            verdict: verdictRes.verdict,
            notes: verdictRes.notes,
            successCriteria: action.successCriteria,
            currentMetrics: verdictRes.currentMetrics,
            baselineMetrics: action.baseline.capturedMetrics,
          } as never,
        },
      });

      return {
        success: true,
        data: {
          actionId,
          verificationVerdict: updatedAction.verificationVerdict,
          verifiedAt: updatedAction.verifiedAt,
          verificationNotes: updatedAction.verificationNotes,
          baselineMetrics: action.baseline.capturedMetrics,
          currentMetrics: verdictRes.currentMetrics,
        },
      };
    }
  );
};

