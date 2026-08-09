import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemediationExecutor } from './executor.js';

describe('RemediationExecutor - Safety & Governance Controls', () => {
  let mockDb: any;
  let executor: RemediationExecutor;

  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/opspilot';
    mockDb = {
      incident: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      service: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'svc-101',
          name: 'Fraud Engine',
          tier: 'T1',
          environment: 'production',
          healthScore: 60,
          dependedOnBy: [],
        }),
      },
      simService: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      policy: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      remediationAction: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
      },
      approval: {
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      incidentEvent: {
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    };

    executor = new RemediationExecutor(mockDb);
  });

  it('1 & 2. Production remediation always enforces human approval', async () => {
    mockDb.incident.findUnique.mockResolvedValue({
      id: 'inc-101',
      environment: 'production',
      serviceId: 'svc-101',
      service: { id: 'svc-101', name: 'Fraud Engine', tier: 'T1', environment: 'production', dependedOnBy: [] },
    });
    mockDb.remediationAction.findFirst.mockResolvedValue(null);
    mockDb.remediationAction.create.mockResolvedValue({
      id: 'action-101',
      status: 'AWAITING_APPROVAL',
      riskScore: 25,
      riskLevel: 'LOW',
    });
    mockDb.approval.create.mockResolvedValue({ id: 'appr-101' });

    const result = await executor.proposeAction({
      incidentId: 'inc-101',
      actionType: 'ROLLBACK_DEPLOYMENT',
      serviceId: 'svc-101',
      rationale: 'Recent deployment caused CPU spike',
    });

    expect(result.requiresApproval).toBe(true);
    expect(result.status).toBe('AWAITING_APPROVAL');
    expect(mockDb.approval.create).toHaveBeenCalled();
    expect(result.reason).toContain('Production state-changing action requires explicit human confirmation');
  });

  it('3 & 4. AI recommendation alone cannot execute without approval step', async () => {
    mockDb.incident.findUnique.mockResolvedValue({
      id: 'inc-102',
      environment: 'production',
      serviceId: 'svc-102',
      service: { id: 'svc-102', name: 'Fraud Engine', tier: 'T1', environment: 'production', dependedOnBy: [] },
    });
    mockDb.remediationAction.findFirst.mockResolvedValue(null);
    mockDb.remediationAction.create.mockResolvedValue({
      id: 'action-102',
      status: 'AWAITING_APPROVAL',
      riskScore: 20,
      riskLevel: 'LOW',
    });
    mockDb.approval.create.mockResolvedValue({ id: 'appr-102' });

    const result = await executor.proposeAction({
      incidentId: 'inc-102',
      actionType: 'RESTART_SERVICE',
      serviceId: 'svc-102',
      rationale: 'AI recommendation',
      proposedByAi: true,
    });

    expect(result.status).toBe('AWAITING_APPROVAL');
    expect(result.approvalId).toBe('appr-102');
  });

  it('5 & 6. Duplicate / concurrent execution is rejected (HTTP 409)', async () => {
    mockDb.remediationAction.findUnique.mockResolvedValue({
      id: 'action-103',
      incidentId: 'inc-103',
      actionType: 'ROLLBACK_DEPLOYMENT',
      status: 'EXECUTING',
      incident: { serviceId: 'svc-103', environment: 'production' },
    });

    await expect(executor.executeAction('action-103')).rejects.toThrow('already in state EXECUTING');
  });

  it('7. Audit events and timeline events are generated on execution', async () => {
    mockDb.remediationAction.findUnique.mockResolvedValue({
      id: 'action-104',
      incidentId: 'inc-104',
      actionType: 'RESTART_SERVICE',
      status: 'APPROVED',
      riskScore: 15,
      incident: { serviceId: 'svc-104', environment: 'production' },
    });

    mockDb.remediationAction.update.mockResolvedValue({});
    mockDb.incident.update.mockResolvedValue({});

    const result = await executor.executeAction('action-104', 'dev-operator-user');

    expect(result.success).toBe(true);
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'REMEDIATION_EXECUTED_RESTART_SERVICE',
          actorType: 'USER',
          targetId: 'svc-104',
        }),
      }),
    );
    expect(mockDb.incidentEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'REMEDIATION_EXECUTION_STARTED',
        }),
      }),
    );
  });

  it('8. Crisp action preview generated correctly', async () => {
    mockDb.remediationAction.findUnique.mockResolvedValue({
      id: 'action-105',
      actionType: 'ROLLBACK_DEPLOYMENT',
      riskScore: 25,
      riskLevel: 'LOW',
      status: 'AWAITING_APPROVAL',
      incident: {
        id: 'inc-105',
        serviceId: 'svc-105',
        environment: 'production',
        service: { name: 'Fraud Engine' },
      },
      approval: {
        id: 'appr-105',
        aiRecommendation: 'Recent deployment is correlated with elevated CPU utilization and P99 latency degradation.',
      },
    });

    const preview = await executor.getActionPreview('action-105');

    expect(preview.actionName).toBe('Rollback Fraud Engine');
    expect(preview.serviceName).toBe('Fraud Engine');
    expect(preview.environment).toBe('production');
    expect(preview.requiresApproval).toBe(true);
    expect(preview.whatWillHappen.length).toBeGreaterThan(0);
    expect(preview.whatWillHappen[0]).toContain('Roll back Fraud Engine');
  });
});
