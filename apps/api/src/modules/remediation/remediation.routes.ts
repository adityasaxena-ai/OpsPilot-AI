import type { FastifyPluginAsync } from 'fastify';
import { RemediationExecutor } from '@opspilot/remediation';
import { VerificationAgent } from '@opspilot/agents';
import { db } from '../../lib/db.js';

export const remediationRoutes: FastifyPluginAsync = async (app) => {
  const executor = new RemediationExecutor(db);
  const verifier = new VerificationAgent(db);

  // GET /api/v1/remediation — List remediation actions
  app.get('/', async (request) => {
    const actions = await db.remediationAction.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        incident: { select: { title: true, severity: true } },
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

    if (!incidentId || !actionType || !serviceId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'MISSING_PARAM', message: 'incidentId, actionType, serviceId required' },
      });
    }

    try {
      const result = await executor.proposeAction({
        incidentId,
        actionType,
        serviceId,
        rationale: rationale ?? 'Remediation proposed by OpsPilot AI',
      });

      return { success: true, data: result };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action proposal failed';
      return reply.status(500).send({ success: false, error: { code: 'PROPOSAL_FAILED', message: msg } });
    }
  });

  // POST /api/v1/remediation/:id/approve — Human operator approves a pending action
  app.post<{ Params: { id: string } }>('/:id/approve', async (request, reply) => {
    const actionId = request.params.id;

    const action = await db.remediationAction.findUnique({
      where: { id: actionId },
      include: { approval: true },
    });

    if (!action) {
      return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Action not found' } });
    }

    // Update action & approval request
    await db.remediationAction.update({
      where: { id: actionId },
      data: { status: 'APPROVED' },
    });

    await db.approval.updateMany({
      where: { remediationActionId: actionId, status: 'PENDING' },
      data: { status: 'APPROVED', respondedAt: new Date() },
    });

    await db.incidentEvent.create({
      data: {
        incidentId: action.incidentId,
        eventType: 'APPROVAL_GRANTED',
        actorType: 'USER',
        description: `Human operator approved remediation action: ${action.actionType}`,
        metadata: { actionId },
      },
    });

    // Execute immediately post approval
    const execRes = await executor.executeAction(actionId, 'dev-user-admin');

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
  app.post<{ Params: { id: string } }>('/:id/execute', async (request, reply) => {
    const actionId = request.params.id;

    try {
      const execRes = await executor.executeAction(actionId);
      const action = await db.remediationAction.findUnique({ where: { id: actionId } });
      const verifRes = action ? await verifier.verifyRecovery(action.incidentId) : null;

      return { success: true, data: { execution: execRes, verification: verifRes } };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Execution failed';
      return reply.status(500).send({ success: false, error: { code: 'EXECUTION_FAILED', message: msg } });
    }
  });
};
