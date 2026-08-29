import type { FastifyPluginAsync } from 'fastify';
import {
  getTelemetryProvider,
  getTelemetryProviderMode,
  setTelemetryProviderMode,
  getReplayProvider,
  ProviderMode,
} from '@opspilot/telemetry';
import { redis } from '../../lib/redis.js';
import { requirePermission } from '../auth/auth.middleware.js';

const REDIS_KEY = 'opspilot:telemetry:mode';

/**
 * Syncs the in-memory provider mode from Redis on startup / per-request.
 * Returns the mode that was loaded (or null if nothing was saved).
 */
async function syncProviderModeFromRedis(): Promise<ProviderMode | null> {
  try {
    const savedMode = await redis.get(REDIS_KEY);
    if (savedMode === 'otel' || savedMode === 'mock' || savedMode === 'replay') {
      setTelemetryProviderMode(savedMode as ProviderMode);
      return savedMode as ProviderMode;
    }
  } catch {
    // Non-fatal: fall back to in-memory mode
  }
  return null;
}

/**
 * Saves the current provider mode to Redis.
 */
async function persistProviderMode(mode: ProviderMode): Promise<void> {
  try {
    await redis.set(REDIS_KEY, mode);
  } catch {
    // Non-fatal: in-memory mode will be used
  }
}

/**
 * Returns the status of the EFFECTIVE serving provider.
 *
 * Design contract:
 *   - If the active provider is healthy → return its status directly.
 *   - If the active provider is OTel but UNAVAILABLE → auto-switch to mock,
 *     persist to Redis, and return mock's healthy status.
 *   - If the active provider is mock or replay → return its status directly.
 *
 * This ensures the UI always reflects what is ACTUALLY serving telemetry,
 * never displaying an OTel unavailability when mock is the effective provider.
 */
async function getEffectiveStatus() {
  const provider = getTelemetryProvider();
  const status = await provider.getStatus();

  // If OTel is selected but unreachable → transparently fall back to mock
  if (provider.name === 'otel' && status.status === 'UNAVAILABLE') {
    console.info(
      '[telemetry] OTel unavailable — switching effective provider to mock.',
      { reason: status.details?.error ?? 'unreachable' },
    );
    const mockProvider = setTelemetryProviderMode('mock');
    await persistProviderMode('mock');
    return mockProvider.getStatus();
  }

  return status;
}

export const telemetryRoutes: FastifyPluginAsync = async (app) => {
  // On startup: sync saved provider from Redis. If OTel was saved and is
  // unreachable, getEffectiveStatus will correct it on first request.
  app.addHook('onReady', async () => {
    await syncProviderModeFromRedis();
  });

  // GET /api/v1/telemetry/status
  // Returns the status of the provider ACTUALLY serving telemetry.
  // If OTel is configured but unreachable, auto-switches to mock and returns
  // mock's HEALTHY status. Redis is updated so future requests stay on mock.
  app.get('/status', async () => {
    await syncProviderModeFromRedis();
    const effectiveStatus = await getEffectiveStatus();
    return { success: true, data: effectiveStatus };
  });

  // POST /api/v1/telemetry/provider — Explicit operator override (requires ADMIN_CONFIGURATION)
  // Switches the active provider and persists to Redis.
  // Note: setting 'otel' when OTel is unavailable will auto-correct on the
  // next GET /status call — use this intentionally to test OTel connectivity.
  app.post<{ Body: { provider: ProviderMode } }>('/provider', { preHandler: requirePermission('ADMIN_CONFIGURATION') }, async (request, reply) => {
    const { provider } = request.body ?? {};

    if (provider !== 'mock' && provider !== 'replay' && provider !== 'otel') {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_PROVIDER', message: 'Provider must be otel, mock, or replay' },
      });
    }

    await persistProviderMode(provider);
    const active = setTelemetryProviderMode(provider);
    const status = await active.getStatus();
    return { success: true, data: status };
  });

  // POST /api/v1/telemetry/demo/override — Live demo metric override (requires ADMIN_CONFIGURATION)
  app.post<{ Body: { serviceName: string; rps?: number; errorRate?: number; latencyP99?: number } }>(
    '/demo/override',
    { preHandler: requirePermission('ADMIN_CONFIGURATION') },
    async (request) => {
      const { globalOtelEmitter } = await import('@opspilot/telemetry');
      const { serviceName, rps, errorRate, latencyP99 } = request.body ?? {};
      const overrideObj: { rps?: number; errorRate?: number; latencyP99?: number } = {};
      if (typeof rps === 'number') overrideObj.rps = rps;
      if (typeof errorRate === 'number') overrideObj.errorRate = errorRate;
      if (typeof latencyP99 === 'number') overrideObj.latencyP99 = latencyP99;

      globalOtelEmitter.setOverride(serviceName, overrideObj);
      await globalOtelEmitter.emitMetrics();

      return {
        success: true,
        data: {
          message: `Updated live OTel metrics override for ${serviceName}`,
          serviceName,
          override: { rps, errorRate, latencyP99 },
        },
      };
    },
  );

  // POST /api/v1/telemetry/record/start — Start recording live telemetry frames (requires ADMIN_CONFIGURATION)
  app.post<{ Body: { title?: string } }>('/record/start', { preHandler: requirePermission('ADMIN_CONFIGURATION') }, async (request) => {
    const { title } = request.body ?? {};
    const replay = getReplayProvider();
    replay.startRecording(title ?? 'Live Telemetry Stream Snapshot');

    return {
      success: true,
      data: {
        message: 'Started recording live telemetry stream',
        isRecording: true,
      },
    };
  });

  // POST /api/v1/telemetry/record/stop — Stop recording and save snapshot (requires ADMIN_CONFIGURATION)
  app.post('/record/stop', { preHandler: requirePermission('ADMIN_CONFIGURATION') }, async () => {
    const replay = getReplayProvider();
    const recording = replay.stopRecording();

    return {
      success: true,
      data: {
        message: `Recording saved (${recording.frameCount} frames, ${recording.durationSeconds}s)`,
        recording,
      },
    };
  });

  // POST /api/v1/telemetry/replay/start — Start replaying loaded recording (requires ADMIN_CONFIGURATION)
  app.post('/replay/start', { preHandler: requirePermission('ADMIN_CONFIGURATION') }, async () => {
    await persistProviderMode('replay');

    const replay = getReplayProvider();
    replay.ensureRecording();
    setTelemetryProviderMode('replay');

    const status = await replay.getStatus();
    return {
      success: true,
      data: status,
    };
  });
};
