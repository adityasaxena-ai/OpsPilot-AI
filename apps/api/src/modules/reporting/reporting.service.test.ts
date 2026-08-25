import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../../lib/db.js';
import {
  getOperationalReport,
  getGovernanceReport,
  getExecutiveReport,
} from './reporting.service.js';

describe('Reporting Service Unit Aggregations', () => {
  let serviceId: string;
  let assetId: string;
  let monitorId: string;

  const cleanupReportingTables = async () => {
    await db.auditLog.deleteMany({});
    await db.aiIncidentTimelineEntry.deleteMany({});
    await db.aiIncident.deleteMany({});
    await db.driftEvent.deleteMany({});
    await db.driftMonitor.deleteMany({});
    await db.governanceApproval.deleteMany({});
    await db.governanceRiskAssessment.deleteMany({});
    await db.governedAsset.deleteMany({});
    await db.remediationAction.deleteMany({});
    await db.incidentEvent.deleteMany({});
    await db.incident.deleteMany({});
    await db.service.deleteMany({});
  };

  beforeAll(async () => {
    await cleanupReportingTables();
  });

  beforeEach(async () => {
    await cleanupReportingTables();

    // 1. Create a Service
    const service = await db.service.create({
      data: {
        name: 'Payment Gateway API',
        slug: 'payment-gateway-api-report-test',
        description: 'Core payment processing service',
        tier: 'T1',
        environment: 'production',
        ownerTeam: 'Checkout Team',
        ownerEmail: 'checkout@opspilot.dev',
        status: 'HEALTHY',
      },
    });
    serviceId = service.id;

    // 2. Create Incidents with known MTTR values
    await db.incident.create({
      data: {
        title: 'Payment Gateway High Latency',
        description: 'p99 latency reached 2500ms',
        severity: 'P1',
        status: 'RESOLVED',
        serviceId,
        environment: 'production',
        mttdSeconds: 60,
        mttaSeconds: 120,
        mttrSeconds: 600,
        detectedAt: new Date(),
        resolvedAt: new Date(),
      },
    });

    await db.incident.create({
      data: {
        title: 'Payment Gateway Connection Pool Exhaustion',
        description: 'DB connection limit reached',
        severity: 'P2',
        status: 'INVESTIGATING',
        serviceId,
        environment: 'production',
        mttdSeconds: 120,
        mttaSeconds: 240,
        mttrSeconds: 1200,
        detectedAt: new Date(),
      },
    });

    // 3. Create Remediation Actions (1 SUCCEEDED, 1 FAILED)
    await db.remediationAction.create({
      data: {
        incidentId: (await db.incident.findFirstOrThrow()).id,
        actionType: 'RESTART_SERVICE',
        status: 'SUCCEEDED',
        riskScore: 20,
      },
    });

    await db.remediationAction.create({
      data: {
        incidentId: (await db.incident.findFirstOrThrow()).id,
        actionType: 'SCALE_SERVICE',
        status: 'FAILED',
        riskScore: 40,
      },
    });

    // 4. Create Governed Assets (1 HIGH, 1 CRITICAL)
    const asset1 = await db.governedAsset.create({
      data: {
        name: 'Fraud Detection Model v1',
        assetType: 'MODEL',
        description: 'Real-time transaction fraud scoring model',
        ownerTeam: 'Risk Security',
        ownerEmail: 'risk@opspilot.dev',
        purpose: 'Fraud detection',
        lifecycleStage: 'LIVE',
        riskLevel: 'HIGH',
      },
    });
    assetId = asset1.id;

    await db.governedAsset.create({
      data: {
        name: 'LLM Support Agent v2',
        assetType: 'AGENT',
        description: 'Customer-facing conversational agent',
        ownerTeam: 'Customer Experience',
        ownerEmail: 'cx@opspilot.dev',
        purpose: 'Customer support automation',
        lifecycleStage: 'LIVE',
        riskLevel: 'CRITICAL',
      },
    });

    // 5. Create Drift Monitor & Active Drift Event
    const monitor = await db.driftMonitor.create({
      data: {
        governedAssetId: assetId,
        metricName: 'prediction_confidence',
        method: 'PSI',
        baselineSnapshot: [0.5, 0.5],
        threshold: 0.25,
      },
    });
    monitorId = monitor.id;

    await db.driftEvent.create({
      data: {
        driftMonitorId: monitorId,
        governedAssetId: assetId,
        state: 'DRIFT_DETECTED',
        metricName: 'prediction_confidence',
        baselineValue: [0.5, 0.5],
        currentValue: [0.1, 0.9],
        computedScore: 0.45,
        threshold: 0.25,
      },
    });

    // 6. Create Pending Governance Approval
    await db.governanceApproval.create({
      data: {
        governedAssetId: assetId,
        targetStage: 'LIVE',
        status: 'PENDING',
        requestedBySubject: 'test-operator',
      },
    });

    // 7. Create Open AI Incident
    await db.aiIncident.create({
      data: {
        governedAssetId: assetId,
        driftEventId: (await db.driftEvent.findFirstOrThrow()).id,
        incidentType: 'MODEL_DRIFT',
        title: 'High confidence drift on Fraud Detection Model v1',
        description: 'Drift score 0.45 exceeded threshold 0.25',
        severity: 'P2',
        status: 'TRIAGED',
      },
    });
  });

  afterAll(async () => {
    await cleanupReportingTables();
  });

  it('computes Operational Report arithmetic correctly', async () => {
    const report = await getOperationalReport(db, 30);

    expect(report.timeWindowDays).toBe(30);
    expect(report.incidentCounts.totalInWindow).toBe(2);
    expect(report.incidentCounts.bySeverity['P1']).toBe(1);
    expect(report.incidentCounts.bySeverity['P2']).toBe(1);

    // Mean time average assertions: mttd (60+120)/2 = 90, mtta (120+240)/2 = 180, mttr (600+1200)/2 = 900
    expect(report.meanTimeMetrics.mttdSecondsAverage).toBe(90);
    expect(report.meanTimeMetrics.mttaSecondsAverage).toBe(180);
    expect(report.meanTimeMetrics.mttrSecondsAverage).toBe(900);

    // Remediation outcomes assertions: 1 SUCCEEDED, 1 FAILED
    expect(report.remediationOutcomes.totalInWindow).toBe(2);
    expect(report.remediationOutcomes.byStatus['SUCCEEDED']).toBe(1);
    expect(report.remediationOutcomes.byStatus['FAILED']).toBe(1);

    // Active drift events: 1 in DRIFT_DETECTED
    expect(report.activeDriftEvents.totalActive).toBe(1);
    expect(report.activeDriftEvents.byState['DRIFT_DETECTED']).toBe(1);

    // Top affected services
    expect(report.topAffectedServices.length).toBe(1);
    expect(report.topAffectedServices[0]!.serviceName).toBe('Payment Gateway API');
    expect(report.topAffectedServices[0]!.incidentCount).toBe(2);
  });

  it('computes Governance Report counts correctly', async () => {
    const report = await getGovernanceReport(db);

    expect(report.assetInventory.totalAssets).toBe(2);
    expect(report.assetInventory.byAssetType['MODEL']).toBe(1);
    expect(report.assetInventory.byAssetType['AGENT']).toBe(1);
    expect(report.riskDistribution.byRiskLevel['HIGH']).toBe(1);
    expect(report.riskDistribution.byRiskLevel['CRITICAL']).toBe(1);

    expect(report.pendingApprovalsCount).toBe(1);

    expect(report.openAiIncidents.totalOpen).toBe(1);
    expect(report.openAiIncidents.byStatus['TRIAGED']).toBe(1);
    expect(report.openAiIncidents.byIncidentType['MODEL_DRIFT']).toBe(1);
  });

  it('proves the "Reports Never Disagree" principle between Executive, Operational, and Governance reports', async () => {
    const [operational, governance, executive] = await Promise.all([
      getOperationalReport(db, 30),
      getGovernanceReport(db),
      getExecutiveReport(db, 30),
    ]);

    // Active drift event count must be byte-identical
    expect(executive.operationalPosture.activeDriftEvents).toBe(operational.activeDriftEvents.totalActive);

    // Pending governance approvals count must be byte-identical
    expect(executive.operationalPosture.pendingGovernanceApprovals).toBe(governance.pendingApprovalsCount);

    // Remediation effectiveness metrics
    expect(executive.remediationEffectiveness.successfulCount).toBe(operational.remediationOutcomes.byStatus['SUCCEEDED'] ?? 0);
    expect(executive.remediationEffectiveness.failedCount).toBe(operational.remediationOutcomes.byStatus['FAILED'] ?? 0);

    // 1 SUCCEEDED out of 2 terminal = 50.0%
    expect(executive.remediationEffectiveness.successRatePercent).toBe(50.0);

    // Operational posture overall status should be CRITICAL because of active P1 incident
    expect(executive.operationalPosture.overallStatus).toBe('CRITICAL');
    expect(executive.operationalPosture.activeP1P2Incidents).toBe(1);

    // Top risks merged list contains seeded items ordered by rankScore
    expect(executive.topRisks.length).toBeGreaterThan(0);
    expect(executive.topRisks[0]!.rankScore).toBeGreaterThanOrEqual(75);
  });
});
