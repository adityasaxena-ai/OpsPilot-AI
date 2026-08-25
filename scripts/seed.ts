/**
 * OpsPilot AI — Database Seed Script
 * Populates the 9 simulated services, their dependencies, simulator state,
 * a default admin user, and default policies.
 *
 * Usage: pnpm db:seed
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  console.log('🌱 Seeding OpsPilot database...');

  // ── Admin & Dev Test Users ──────────────────────────────────────────────────
  const adminUser = await db.user.upsert({
    where: { email: 'admin@opspilot.dev' },
    update: {},
    create: {
      email: 'admin@opspilot.dev',
      name: 'OpsPilot Admin',
      role: 'ADMIN',
    },
  });
  console.log('✅ Admin user created:', adminUser.email);

  const icUser = await db.user.upsert({
    where: { email: 'sre@opspilot.dev' },
    update: {},
    create: {
      email: 'sre@opspilot.dev',
      name: 'SRE Engineer',
      role: 'INCIDENT_COMMANDER',
    },
  });
  console.log('✅ SRE user created:', icUser.email);

  const devSecAdmin = await db.user.upsert({
    where: { email: 'sec-admin-user@opspilot.dev' },
    update: {},
    create: {
      id: 'sec-admin-user',
      email: 'sec-admin-user@opspilot.dev',
      name: 'Dev SECURITY_ADMIN sec-admin-user',
      role: 'ADMIN',
    },
  });
  console.log('✅ Dev SEC_ADMIN user created:', devSecAdmin.id);

  const devViewer = await db.user.upsert({
    where: { email: 'viewer-user@opspilot.dev' },
    update: {},
    create: {
      id: 'viewer-user',
      email: 'viewer-user@opspilot.dev',
      name: 'Dev VIEWER viewer-user',
      role: 'VIEWER',
    },
  });
  console.log('✅ Dev VIEWER user created:', devViewer.id);

  const devDefaultAdmin = await db.user.upsert({
    where: { email: 'dev-user-admin@opspilot.dev' },
    update: {},
    create: {
      id: 'dev-user-admin',
      email: 'dev-user-admin@opspilot.dev',
      name: 'Dev Default Admin',
      role: 'ADMIN',
    },
  });
  console.log('✅ Dev Default Admin user created:', devDefaultAdmin.id);

  // ── Services ───────────────────────────────────────────────────────────────
  const serviceDefinitions = [
    {
      slug: 'api-gateway',
      name: 'API Gateway',
      description: 'Primary API gateway — routes all external traffic to downstream services',
      tier: 'T1' as const,
      ownerTeam: 'Platform Engineering',
    },
    {
      slug: 'payments-api',
      name: 'Payments API',
      description: 'Core payments processing service — handles all payment transactions',
      tier: 'T1' as const,
      ownerTeam: 'Payments Team',
    },
    {
      slug: 'fraud-engine',
      name: 'Fraud Engine',
      description: 'Real-time fraud detection and risk scoring for transactions',
      tier: 'T1' as const,
      ownerTeam: 'Risk & Compliance',
    },
    {
      slug: 'auth-service',
      name: 'Auth Service',
      description: 'Authentication and authorisation — JWT, OAuth2, session management',
      tier: 'T1' as const,
      ownerTeam: 'Identity Team',
    },
    {
      slug: 'customer-api',
      name: 'Customer API',
      description: 'Customer profile management, preferences, and account data',
      tier: 'T2' as const,
      ownerTeam: 'Customer Experience',
    },
    {
      slug: 'notification-service',
      name: 'Notification Service',
      description: 'Email, SMS, and push notification delivery service',
      tier: 'T2' as const,
      ownerTeam: 'Customer Experience',
    },
    {
      slug: 'payment-db',
      name: 'Payment DB',
      description: 'Primary PostgreSQL database for payments and transaction records',
      tier: 'T1' as const,
      ownerTeam: 'Database Platform',
    },
    {
      slug: 'redis-cache',
      name: 'Redis Cache',
      description: 'Distributed caching layer — sessions, rate limiting, hot data',
      tier: 'T1' as const,
      ownerTeam: 'Platform Engineering',
    },
    {
      slug: 'message-queue',
      name: 'Message Queue',
      description: 'Async message broker — RabbitMQ for event-driven communication',
      tier: 'T2' as const,
      ownerTeam: 'Platform Engineering',
    },
  ];

  const services: Record<string, string> = {}; // slug → id

  for (const def of serviceDefinitions) {
    const svc = await db.service.upsert({
      where: { slug: def.slug },
      update: { status: 'HEALTHY', healthScore: 100 },
      create: {
        name: def.name,
        slug: def.slug,
        description: def.description,
        tier: def.tier,
        environment: 'production',
        ownerTeam: def.ownerTeam,
        ownerEmail: `${def.ownerTeam.toLowerCase().replace(/\s+/g, '-')}@company.com`,
        status: 'HEALTHY',
        healthScore: 100,
      },
    });
    services[def.slug] = svc.id;
    console.log(`  ✅ Service: ${def.name}`);
  }

  // ── Simulator State ────────────────────────────────────────────────────────
  const simDefaults: Record<string, { throughputRps: number; dbMax?: number; hasQueue?: boolean }> = {
    'api-gateway': { throughputRps: 500 },
    'payments-api': { throughputRps: 200, dbMax: 50 },
    'fraud-engine': { throughputRps: 200 },
    'auth-service': { throughputRps: 300 },
    'customer-api': { throughputRps: 150 },
    'notification-service': { throughputRps: 80, hasQueue: true },
    'payment-db': { throughputRps: 0, dbMax: 200 },
    'redis-cache': { throughputRps: 1000 },
    'message-queue': { throughputRps: 0, hasQueue: true },
  };

  for (const [slug, defaults] of Object.entries(simDefaults)) {
    const serviceId = services[slug];
    if (!serviceId) continue;

    await db.simService.upsert({
      where: { serviceId },
      update: {},
      create: {
        serviceId,
        cpuPercent: 20 + Math.random() * 10,
        memoryPercent: 35 + Math.random() * 10,
        latencyP50Ms: 45 + Math.random() * 20,
        latencyP99Ms: 140 + Math.random() * 40,
        errorRatePercent: 0.05 + Math.random() * 0.1,
        throughputRps: defaults.throughputRps + Math.random() * 20,
        dbConnectionsActive: 8 + Math.floor(Math.random() * 5),
        dbConnectionsMax: defaults.dbMax ?? 100,
        queueDepth: defaults.hasQueue ? Math.floor(Math.random() * 50) : 0,
        isHealthy: true,
        failureScenario: null,
        failureStartedAt: null,
      },
    });
  }
  console.log('✅ Simulator state seeded for all services');

  // ── Service Dependencies ───────────────────────────────────────────────────
  const depEdges: Array<[string, string]> = [
    ['api-gateway', 'payments-api'],
    ['api-gateway', 'auth-service'],
    ['api-gateway', 'customer-api'],
    ['payments-api', 'payment-db'],
    ['payments-api', 'redis-cache'],
    ['payments-api', 'fraud-engine'],
    ['fraud-engine', 'payment-db'],
    ['fraud-engine', 'redis-cache'],
    ['auth-service', 'redis-cache'],
    ['customer-api', 'payment-db'],
    ['notification-service', 'message-queue'],
  ];

  for (const [fromSlug, toSlug] of depEdges) {
    const fromId = services[fromSlug];
    const toId = services[toSlug];
    if (!fromId || !toId) continue;

    await db.serviceDependency.upsert({
      where: { serviceId_dependsOnId: { serviceId: fromId, dependsOnId: toId } },
      update: {},
      create: { serviceId: fromId, dependsOnId: toId },
    });
  }
  console.log('✅ Service dependencies seeded');

  // ── Default Policies ───────────────────────────────────────────────────────
  const policies = [
    {
      name: 'Restart Service — Tier-3 (Non-prod)',
      description: 'Auto-approve service restarts for tier-3 services in non-production',
      actionType: 'RESTART_SERVICE' as const,
      environment: 'development' as const,
      serviceTier: 'T3' as const,
      maxRiskScore: 30,
      requiresApproval: false,
      isAutonomous: true,
      maxRetries: 2,
    },
    {
      name: 'Restart Service — Tier-1 (Production)',
      description: 'Require incident commander approval for tier-1 production restarts',
      actionType: 'RESTART_SERVICE' as const,
      environment: 'production' as const,
      serviceTier: 'T1' as const,
      maxRiskScore: 60,
      requiresApproval: true,
      isAutonomous: false,
      maxRetries: 1,
    },
    {
      name: 'Rollback Deployment — Production',
      description: 'Require human approval for all production rollbacks',
      actionType: 'ROLLBACK_DEPLOYMENT' as const,
      environment: 'production' as const,
      serviceTier: 'T1' as const,
      maxRiskScore: 70,
      requiresApproval: true,
      isAutonomous: false,
      maxRetries: 1,
    },
    {
      name: 'Clear Cache — Any',
      description: 'Cache clears can be auto-approved for low risk scenarios',
      actionType: 'CLEAR_CACHE' as const,
      environment: 'production' as const,
      serviceTier: 'T2' as const,
      maxRiskScore: 30,
      requiresApproval: false,
      isAutonomous: true,
      maxRetries: 3,
    },
    {
      name: 'Retry Batch — Tier-2',
      description: 'Batch retries for tier-2 services auto-approved up to 2x',
      actionType: 'RETRY_BATCH' as const,
      environment: 'production' as const,
      serviceTier: 'T2' as const,
      maxRiskScore: 30,
      requiresApproval: false,
      isAutonomous: true,
      maxRetries: 2,
    },
  ];

  for (const policy of policies) {
    await db.policy.upsert({
      where: { id: `policy-${policy.actionType}-${policy.environment}-${policy.serviceTier}` },
      update: {},
      create: { id: `policy-${policy.actionType}-${policy.environment}-${policy.serviceTier}`, ...policy },
    });
  }
  console.log('✅ Default policies seeded');

  // ── Sample Runbooks ────────────────────────────────────────────────────────
  const runbooks = [
    {
      title: 'Payments API — High Error Rate Runbook',
      description: 'Steps to diagnose and resolve high error rates on the Payments API',
      serviceSlug: 'payments-api',
      content: `# Payments API High Error Rate Runbook

## Symptoms
- Error rate > 10% on /api/payments endpoints
- Increased P99 latency > 2000ms
- Customer-facing payment failures

## Immediate Steps
1. Check error rate trend in metrics dashboard
2. Review recent deployments (last 2 hours)
3. Check database connection pool utilisation
4. Review error logs for exception patterns

## Common Causes
### Bad Deployment
- Check SimDeployment table for recent bad deployments
- Compare error rate onset time with deployment time
- **Action:** Rollback to previous stable version

### DB Connection Exhaustion
- Check dbConnectionsActive vs dbConnectionsMax
- Look for slow queries in DB logs
- **Action:** Restart service to release connections, then investigate slow queries

### Dependency Failure
- Check fraud-engine health
- Check payment-db health
- **Action:** If dependency is down, check its own runbook

## Recovery Steps
1. Rollback if deployment-related
2. Restart service if connection pool exhausted
3. Scale service if load-induced
4. Alert Payments Team lead if not resolved in 15 minutes
`,
      tags: ['payments', 'error-rate', 'p1', 'deployment'],
    },
    {
      title: 'Database Connection Exhaustion Runbook',
      description: 'Diagnose and resolve database connection pool exhaustion',
      serviceSlug: 'payment-db',
      content: `# Database Connection Exhaustion Runbook

## Symptoms
- DB connections at 100% capacity
- Increased query latency
- Connection timeout errors in application logs

## Immediate Steps
1. Check current connection count vs max pool size
2. Identify which service is holding the most connections
3. Check for long-running queries blocking connections
4. Review recent deployments for connection leak code

## Actions
### Emergency
- Restart the service consuming the most connections
- Kill long-running queries

### Medium-term
- Increase connection pool size if traffic is legitimate
- Audit connection handling code for leaks

## Prevention
- Set connection pool limits per service
- Monitor connection count with alerting at 80%
`,
      tags: ['database', 'connections', 'p1'],
    },
    {
      title: 'Bad Deployment Rollback Runbook',
      description: 'Standard procedure for rolling back a failed deployment',
      serviceSlug: null,
      content: `# Bad Deployment Rollback Runbook

## Indicators of Bad Deployment
- Error rate spike within 5 minutes of deployment
- Latency degradation immediately post-deployment
- New exception patterns in logs (NullPointerException, ClassNotFound, etc.)

## Rollback Steps
1. Confirm deployment is the root cause (check timing correlation)
2. Obtain incident commander approval
3. Trigger rollback in CI/CD system to previous stable tag
4. Monitor error rate for recovery (should drop within 2 minutes)
5. Verify all health checks pass
6. Close incident and create postmortem

## Post-Rollback
- Ensure bad deployment is quarantined in CI/CD
- Notify development team with specific error signatures
- Schedule root cause analysis for the bad code
`,
      tags: ['deployment', 'rollback', 'general', 'p1'],
    },
  ];

  for (const rb of runbooks) {
    const serviceId = rb.serviceSlug ? services[rb.serviceSlug] : undefined;
    await db.runbook.create({
      data: {
        title: rb.title,
        description: rb.description,
        serviceId: serviceId ?? null,
        content: rb.content,
        tags: rb.tags,
        version: '1.0',
        isActive: true,
      },
    });
  }
  console.log('✅ Sample runbooks seeded');

  // ── Threshold Rules ────────────────────────────────────────────────────────
  const thresholdRules = [
    {
      name: 'High Error Rate Threshold',
      metric: 'errorRatePercent',
      operator: 'GT',
      threshold: 5.0,
      severity: 'P1' as const,
      isEnabled: true,
    },
    {
      name: 'P99 Latency Degradation',
      metric: 'latencyP99Ms',
      operator: 'GT',
      threshold: 1500,
      severity: 'P2' as const,
      isEnabled: true,
    },
    {
      name: 'High CPU Utilization',
      metric: 'cpuPercent',
      operator: 'GT',
      threshold: 85.0,
      severity: 'P2' as const,
      isEnabled: true,
    },
    {
      name: 'Memory Exhaustion Risk',
      metric: 'memoryPercent',
      operator: 'GT',
      threshold: 90.0,
      severity: 'P2' as const,
      isEnabled: true,
    },
  ];

  for (const tr of thresholdRules) {
    await db.thresholdRule.create({
      data: tr,
    });
  }
  console.log('✅ Threshold rules seeded');

  // ── Governance Policies ───────────────────────────────────────────────────
  const governancePolicies = [
    {
      name: 'Model Promotion Policy',
      description: 'Requires human approval to promote AI Models to APPROVED or LIVE stages',
      appliesTo: 'MODEL' as const,
      requiresApprovalFor: ['APPROVED', 'LIVE'],
      isActive: true,
    },
    {
      name: 'Agent Deployment Policy',
      description: 'Requires human approval to deploy AI Agents to APPROVED or LIVE stages',
      appliesTo: 'AGENT' as const,
      requiresApprovalFor: ['APPROVED', 'LIVE'],
      isActive: true,
    },
    {
      name: 'Prompt & Knowledge Base Policy',
      description: 'Requires approval to release system prompts and knowledge sources to LIVE',
      appliesTo: 'PROMPT' as const,
      requiresApprovalFor: ['LIVE'],
      isActive: true,
    },
  ];

  for (const gp of governancePolicies) {
    await db.governancePolicy.create({ data: gp });
  }
  console.log('✅ Governance policies seeded');

  console.log('\n🎉 Seeding complete!');
  console.log(`   Services: ${Object.keys(services).length}`);
  console.log(`   Dependencies: ${depEdges.length}`);
  console.log(`   Policies: ${policies.length}`);
  console.log(`   Runbooks: ${runbooks.length}`);
  console.log(`   Threshold Rules: ${thresholdRules.length}`);
  console.log(`   Governance Policies: ${governancePolicies.length}`);
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed failed:', e);
    await db.$disconnect();
    process.exit(1);
  });
