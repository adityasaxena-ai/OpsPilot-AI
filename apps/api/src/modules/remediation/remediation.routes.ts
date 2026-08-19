import type { FastifyPluginAsync } from 'fastify';
import { RemediationExecutor } from '@opspilot/remediation';
import { VerificationAgent } from '@opspilot/agents';
import { db } from '../../lib/db.js';
import { requirePermission } from '../auth/auth.middleware.js';

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
      // Execute post approval
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

  // POST /api/v1/remediation/:id/execute — Execute an approved action directly
  app.post<{ Params: { id: string } }>(
    '/:id/execute',
    { preHandler: requirePermission('REMEDIATION_EXECUTE') },
    async (request, reply) => {
    const actionId = request.params.id;

    try {
      const operatorId = process.env.NODE_ENV === 'production' ? request.headers['x-operator-id'] as string : 'dev-user-admin';
      const execRes = await executor.executeAction(actionId, operatorId);
      const action = await db.remediationAction.findUnique({ where: { id: actionId } });
      const verifRes = action ? await verifier.verifyRecovery(action.incidentId) : null;

      return { success: true, data: { execution: execRes, verification: verifRes } };
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
      const msg = err instanceof Error ? err.message : 'Execution failed';
      return reply.status(statusCode).send({ success: false, error: { code: 'EXECUTION_FAILED', message: msg } });
    }
  });
};
