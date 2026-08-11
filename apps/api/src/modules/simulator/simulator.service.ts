import crypto from 'crypto';
import type { ChaosInjectionRequest, ChaosScenario } from '@opspilot/types';
import { db } from '../../lib/db.js';
import { sseEmitter } from '../../lib/sse.js';
import { ingestEvent } from '../events/event.service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario Definitions
// ─────────────────────────────────────────────────────────────────────────────

interface ScenarioDefinition {
  id: ChaosScenario;
  label: string;
  description: string;
  icon: string;
  affectsMetrics: string[];
  alertCount: number;
}

const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'BAD_DEPLOYMENT',
    label: 'Bad Deployment',
    description: 'Deploys a broken version causing error rate and latency spikes',
    icon: '🚀',
    affectsMetrics: ['errorRatePercent', 'latencyP99Ms'],
    alertCount: 4,
  },
  {
    id: 'HIGH_CPU',
    label: 'High CPU',
    description: 'CPU usage climbs to 95%+ causing service slowdown',
    icon: '🔥',
    affectsMetrics: ['cpuPercent', 'latencyP50Ms'],
    alertCount: 1,
  },
  {
    id: 'MEMORY_LEAK',
    label: 'Memory Leak',
    description: 'Memory usage gradually ramps up toward OOM',
    icon: '💧',
    affectsMetrics: ['memoryPercent', 'throughputRps'],
    alertCount: 2,
  },
  {
    id: 'DB_CONNECTION_EXHAUSTION',
    label: 'DB Connection Exhaustion',
    description: 'Database connection pool fills up, causing request failures',
    icon: '🗄️',
    affectsMetrics: ['dbConnectionsActive', 'errorRatePercent'],
    alertCount: 3,
  },
  {
    id: 'API_LATENCY',
    label: 'API Latency Spike',
    description: 'P99 latency spikes to 5000ms+ causing timeout cascades',
    icon: '⏱️',
    affectsMetrics: ['latencyP99Ms', 'latencyP50Ms'],
    alertCount: 2,
  },
  {
    id: 'QUEUE_BACKLOG',
    label: 'Queue Backlog',
    description: 'Message queue depth grows uncontrollably',
    icon: '📬',
    affectsMetrics: ['queueDepth', 'throughputRps'],
    alertCount: 1,
  },
  {
    id: 'BATCH_FAILURE',
    label: 'Batch Job Failure',
    description: 'Scheduled batch processing fails repeatedly',
    icon: '⚙️',
    affectsMetrics: ['errorRatePercent', 'throughputRps'],
    alertCount: 1,
  },
  {
    id: 'DISK_FULL',
    label: 'Disk Full',
    description: 'Disk space exhausted — writes failing',
    icon: '💾',
    affectsMetrics: ['errorRatePercent'],
    alertCount: 1,
  },
  {
    id: 'DEPENDENCY_FAILURE',
    label: 'Dependency Failure',
    description: 'Upstream service fails causing cascade across dependents',
    icon: '🔗',
    affectsMetrics: ['errorRatePercent', 'latencyP99Ms', 'throughputRps'],
    alertCount: 5,
  },
  {
    id: 'CERT_EXPIRY',
    label: 'Certificate Expiry',
    description: 'TLS certificate is expiring — secure connections failing',
    icon: '🔐',
    affectsMetrics: ['errorRatePercent'],
    alertCount: 1,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Metric Deltas per scenario
// ─────────────────────────────────────────────────────────────────────────────

interface MetricsDelta {
  cpuPercent?: number;
  memoryPercent?: number;
  latencyP50Ms?: number;
  latencyP99Ms?: number;
  errorRatePercent?: number;
  throughputRps?: number;
  dbConnectionsActive?: number;
  queueDepth?: number;
  isHealthy: boolean;
}

function getMetricsDelta(scenario: ChaosScenario): MetricsDelta {
  switch (scenario) {
    case 'BAD_DEPLOYMENT':
      return { errorRatePercent: 25, latencyP99Ms: 3500, latencyP50Ms: 800, isHealthy: false };
    case 'HIGH_CPU':
      return { cpuPercent: 95, latencyP50Ms: 400, latencyP99Ms: 1200, isHealthy: false };
    case 'MEMORY_LEAK':
      return { memoryPercent: 88, throughputRps: 40, isHealthy: false };
    case 'DB_CONNECTION_EXHAUSTION':
      return { dbConnectionsActive: 100, errorRatePercent: 18, latencyP99Ms: 5000, isHealthy: false };
    case 'API_LATENCY':
      return { latencyP99Ms: 5500, latencyP50Ms: 1200, isHealthy: false };
    case 'QUEUE_BACKLOG':
      return { queueDepth: 50000, throughputRps: 20, isHealthy: false };
    case 'BATCH_FAILURE':
      return { errorRatePercent: 30, throughputRps: 10, isHealthy: false };
    case 'DISK_FULL':
      return { errorRatePercent: 15, isHealthy: false };
    case 'DEPENDENCY_FAILURE':
      return { errorRatePercent: 40, latencyP99Ms: 4000, throughputRps: 30, isHealthy: false };
    case 'CERT_EXPIRY':
      return { errorRatePercent: 100, isHealthy: false };
    default:
      return { isHealthy: true };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulator Tick Loop
// ─────────────────────────────────────────────────────────────────────────────

let tickInterval: ReturnType<typeof setInterval> | null = null;

export function startSimulatorTick(intervalMs = 15_000): void {
  if (tickInterval) return;

  tickInterval = setInterval(async () => {
    try {
      await runTick();
    } catch (err) {
      console.error('[Simulator] Tick error:', err);
    }
  }, intervalMs);

  console.log(`[Simulator] Tick loop started (every ${intervalMs}ms)`);
}

export function stopSimulatorTick(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

async function runTick(): Promise<void> {
  const simServices = await db.simService.findMany({
    include: { service: true },
  });

  const serviceNames = simServices.map((s) => s.service.name);

  // Fetch telemetry from active provider (OpenTelemetry, Mock, or Replay)
  let liveTelemetry: Record<string, import('@opspilot/telemetry').ServiceTelemetry> = {};
  try {
    const { getTelemetryProvider, getReplayProvider, setTelemetryProviderMode } = await import('@opspilot/telemetry');
    const { redis } = await import('../../lib/redis.js');

    try {
      const savedMode = await redis.get('opspilot:telemetry:mode');
      if (savedMode === 'otel' || savedMode === 'mock' || savedMode === 'replay') {
        setTelemetryProviderMode(savedMode as 'otel' | 'mock' | 'replay');
      }
    } catch {
      // Ignore Redis error
    }

    const provider = getTelemetryProvider();
    liveTelemetry = await provider.fetchTelemetry(serviceNames);

    // Record frame if recording mode is active
    getReplayProvider().recordFrame(liveTelemetry);
  } catch (err) {
    console.warn('[Simulator] Telemetry fetch warning (falling back to standby baseline):', err);
  }

  for (const sim of simServices) {
    const noise = () => (Math.random() - 0.5) * 4;
    const live = liveTelemetry[sim.service.name];

    let update: Partial<typeof sim>;

    if (sim.failureScenario) {
      // Under active chaos scenario — maintain degraded metrics
      const delta = getMetricsDelta(sim.failureScenario as ChaosScenario);
      update = {
        cpuPercent: clamp(
          sim.failureScenario === 'HIGH_CPU' ? 92 + noise() : (live?.cpuPercent ?? sim.cpuPercent) + noise(),
          0,
          100,
        ),
        memoryPercent: clamp(
          sim.failureScenario === 'MEMORY_LEAK'
            ? Math.min(sim.memoryPercent + 2, 98)
            : (live?.memoryPercent ?? sim.memoryPercent) + noise(),
          0,
          100,
        ),
        errorRatePercent: Math.max(0, (delta.errorRatePercent ?? sim.errorRatePercent) + noise()),
        latencyP50Ms: Math.max(1, (delta.latencyP50Ms ?? sim.latencyP50Ms) + noise() * 50),
        latencyP99Ms: Math.max(1, (delta.latencyP99Ms ?? sim.latencyP99Ms) + noise() * 200),
        throughputRps: Math.max(0, (delta.throughputRps ?? sim.throughputRps) + noise() * 5),
        dbConnectionsActive: sim.failureScenario === 'DB_CONNECTION_EXHAUSTION'
          ? Math.min(sim.dbConnectionsMax, sim.dbConnectionsActive + 2)
          : sim.dbConnectionsActive,
        queueDepth: sim.failureScenario === 'QUEUE_BACKLOG'
          ? sim.queueDepth + Math.floor(Math.random() * 500)
          : sim.queueDepth,
        isHealthy: false,
        updatedAt: new Date(),
      };
    } else {
      // Live telemetry baseline from OpenTelemetry or Replay
      update = {
        cpuPercent: clamp(live?.cpuPercent ?? (20 + noise() * 3), 0, 100),
        memoryPercent: clamp(live?.memoryPercent ?? (40 + noise() * 3), 0, 100),
        errorRatePercent: Math.max(0, live?.errorRatePercent ?? (0.1 + noise() * 0.1)),
        latencyP50Ms: Math.max(1, live?.latencyP50Ms ?? (50 + noise() * 10)),
        latencyP99Ms: Math.max(1, live?.latencyP99Ms ?? (150 + noise() * 30)),
        throughputRps: Math.max(0, live?.throughputRps ?? (100 + noise() * 15)),
        dbConnectionsActive: clamp(live?.dbConnectionsActive ?? 10, 0, 100),
        queueDepth: Math.max(0, live?.queueDepth ?? 0),
        isHealthy: live?.isHealthy ?? true,
        updatedAt: new Date(),
      };
    }

    await db.simService.update({ where: { id: sim.id }, data: update as never });

    // Emit metrics update for SSE
    sseEmitter.emit('metrics_updated', { serviceId: sim.serviceId });

    // Check alert thresholds and emit events if breached
    await checkAndEmitAlerts(sim.serviceId, { ...sim, ...update } as Record<string, unknown>);
  }
}

async function checkAndEmitAlerts(serviceId: string, metrics: Record<string, unknown>): Promise<void> {
  // Fetch active threshold rules from PostgreSQL
  const dbRules = await db.thresholdRule.findMany({ where: { isEnabled: true } });

  const { RuleEngine } = await import('@opspilot/detection');
  const ruleEngine = new RuleEngine();

  const service = await db.service.findUnique({ where: { id: serviceId } });
  if (!service) return;

  const telemetryPayload = {
    serviceId: service.id,
    serviceName: service.name,
    cpuPercent: (metrics['cpuPercent'] as number) ?? 20,
    memoryPercent: (metrics['memoryPercent'] as number) ?? 35,
    latencyP50Ms: (metrics['latencyP50Ms'] as number) ?? 45,
    latencyP95Ms: (metrics['latencyP95Ms'] as number) ?? 90,
    latencyP99Ms: (metrics['latencyP99Ms'] as number) ?? 130,
    errorRatePercent: (metrics['errorRatePercent'] as number) ?? 0.1,
    throughputRps: (metrics['throughputRps'] as number) ?? 180,
    dbConnectionsActive: (metrics['dbConnectionsActive'] as number) ?? 8,
    queueDepth: (metrics['queueDepth'] as number) ?? 0,
    isHealthy: (metrics['isHealthy'] as boolean) ?? true,
    timestamp: new Date().toISOString(),
  };

  const breaches = ruleEngine.evaluateRules(dbRules as never, {
    [service.name]: telemetryPayload,
  });

  for (const breach of breaches) {
    const fingerprint = crypto
      .createHash('sha256')
      .update(`${serviceId}:${breach.ruleId}:${breach.metric}`)
      .digest('hex')
      .substring(0, 16);

    // Only emit if no active alert with this fingerprint in last 10 mins
    const recentAlert = await db.alert.findFirst({
      where: {
        fingerprint,
        status: 'ACTIVE',
        lastSeenAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
      },
    });

    if (!recentAlert) {
      const event = {
        id: crypto.randomUUID(),
        source: 'telemetry_rule_engine',
        eventType: 'ALERT' as const,
        severity: breach.severity,
        serviceId,
        environment: 'production' as const,
        timestamp: new Date().toISOString(),
        fingerprint,
        labels: { ruleId: breach.ruleId, metric: breach.metric, type: 'threshold_breach' },
        payload: { title: `${breach.ruleName}: ${breach.serviceName}`, description: breach.breachReason ?? 'Threshold breached' },
      };

      await ingestEvent(event);
      sseEmitter.emit('alert_created', { serviceId, title: breach.ruleName });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function getScenarios(): ScenarioDefinition[] {
  return SCENARIOS;
}

export async function getSimulatorStatus() {
  return db.simService.findMany({
    include: { service: { select: { id: true, name: true, slug: true, tier: true } } },
    orderBy: { service: { tier: 'asc' } },
  });
}

export async function injectChaos(request: ChaosInjectionRequest) {
  const delta = getMetricsDelta(request.scenario);

  const simService = await db.simService.findUnique({
    where: { serviceId: request.serviceId },
  });

  if (!simService) throw new Error(`Service ${request.serviceId} not found in simulator`);

  await db.simService.update({
    where: { serviceId: request.serviceId },
    data: {
      ...(delta.cpuPercent !== undefined ? { cpuPercent: delta.cpuPercent } : {}),
      ...(delta.memoryPercent !== undefined ? { memoryPercent: delta.memoryPercent } : {}),
      ...(delta.latencyP50Ms !== undefined ? { latencyP50Ms: delta.latencyP50Ms } : {}),
      ...(delta.latencyP99Ms !== undefined ? { latencyP99Ms: delta.latencyP99Ms } : {}),
      ...(delta.errorRatePercent !== undefined ? { errorRatePercent: delta.errorRatePercent } : {}),
      ...(delta.throughputRps !== undefined ? { throughputRps: delta.throughputRps } : {}),
      ...(delta.dbConnectionsActive !== undefined ? { dbConnectionsActive: delta.dbConnectionsActive } : {}),
      ...(delta.queueDepth !== undefined ? { queueDepth: delta.queueDepth } : {}),
      isHealthy: false,
      failureScenario: request.scenario,
      failureStartedAt: new Date(),
    },
  });

  // Update service status
  await db.service.update({
    where: { id: request.serviceId },
    data: { status: 'DEGRADED', healthScore: 20 },
  });

  // Trigger a deployment record for BAD_DEPLOYMENT
  if (request.scenario === 'BAD_DEPLOYMENT') {
    await db.simDeployment.create({
      data: {
        serviceId: request.serviceId,
        version: `v${Math.floor(Math.random() * 100)}.${Math.floor(Math.random() * 10)}.0-bad`,
        commitSha: crypto.randomBytes(4).toString('hex'),
        deployedBy: 'ci-system',
        isBadDeployment: true,
        failureType: 'BAD_DEPLOYMENT',
      },
    });
  }

  // Immediately generate alerts (don't wait for tick)
  await checkAndEmitAlerts(request.serviceId, await db.simService.findUnique({ where: { serviceId: request.serviceId } }) as never);

  console.log(`[Simulator] 🔥 Chaos injected: ${request.scenario} on ${request.serviceId}`);

  return {
    serviceId: request.serviceId,
    scenario: request.scenario,
    injectedAt: new Date().toISOString(),
    expectedDurationSeconds: request.durationSeconds,
  };
}

export async function healService(serviceId: string): Promise<void> {
  await db.simService.update({
    where: { serviceId },
    data: {
      cpuPercent: 20,
      memoryPercent: 40,
      latencyP50Ms: 50,
      latencyP99Ms: 150,
      errorRatePercent: 0.1,
      throughputRps: 100,
      dbConnectionsActive: 10,
      queueDepth: 0,
      isHealthy: true,
      failureScenario: null,
      failureStartedAt: null,
    },
  });

  await db.service.update({
    where: { id: serviceId },
    data: { status: 'HEALTHY', healthScore: 100 },
  });

  // Resolve active alerts for this service
  await db.alert.updateMany({
    where: { serviceId, status: 'ACTIVE' },
    data: { status: 'RESOLVED' },
  });

  sseEmitter.emit('service_healed', { serviceId });
  console.log(`[Simulator] ✅ Service healed: ${serviceId}`);
}

export async function healAll(): Promise<void> {
  const simServices = await db.simService.findMany({ select: { serviceId: true } });
  await Promise.all(simServices.map((s) => healService(s.serviceId)));
}

export async function triggerDeployment(serviceId: string, isBad: boolean, version?: string) {
  const v = version ?? `v${Date.now().toString(36)}`;

  const deployment = await db.simDeployment.create({
    data: {
      serviceId,
      version: v,
      commitSha: crypto.randomBytes(4).toString('hex'),
      deployedBy: 'ci-system',
      isBadDeployment: isBad,
      failureType: isBad ? 'BAD_DEPLOYMENT' : null,
    },
  });

  if (isBad) {
    await injectChaos({ serviceId, scenario: 'BAD_DEPLOYMENT', durationSeconds: 300 });
  }

  return deployment;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
