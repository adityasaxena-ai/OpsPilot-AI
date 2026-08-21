import type { FastifyPluginAsync } from 'fastify';
import {
  getTelemetryProvider,
  setTelemetryProviderMode,
  getReplayProvider,
  ProviderMode,
} from '@opspilot/telemetry';
import { redis } from '../../lib/redis.js';

const REDIS_KEY = 'opspilot:telemetry:mode';

async function syncProviderModeFromRedis(): Promise<void> {
  try {
    const savedMode = await redis.get(REDIS_KEY);
    if (savedMode === 'otel' || savedMode === 'mock' || savedMode === 'replay') {
      setTelemetryProviderMode(savedMode as ProviderMode);
    }
  } catch {
    // Fallback to in-memory mode if Redis read fails
  }
}

/**
 * On startup: if no explicit operator preference is stored in Redis and the OTel
 * provider is unreachable, automatically fall back to the mock provider.
 * This ensures the application starts in a functional state in cloud environments
 * that do not have a Prometheus/OTel Collector sidecar.
 *
 * Operators can always switch back via POST /api/v1/telemetry/provider.
 */
async function autoProbeAndFallback(): Promise<void> {
  try {
    const savedMode = await redis.get(REDIS_KEY);
    // Only auto-fallback when no explicit operator preference is stored
    if (savedMode !== null) return;

    const provider = getTelemetryProvider();
    const status = await provider.getStatus();

    if (status.status === 'UNAVAILABLE') {
      setTelemetryProviderMode('mock');
      try {
        await redis.set(REDIS_KEY, 'mock');
      } catch {
        // Redis write failure is non-fatal; in-memory mode will be used
      }
      console.info(
        '[telemetry] OTel provider unreachable on startup — auto-switched to mock provider.',
        { reason: status.details?.error ?? 'unreachable' },
      );
    }
  } catch (err) {
    // Auto-probe failure must never crash startup
    console.warn('[telemetry] Auto-probe failed during startup (non-fatal):', err);
  }
}

export const telemetryRoutes: FastifyPluginAsync = async (app) => {
  // On startup: probe OTel reachability and auto-fallback to mock if unavailable
  // and no explicit operator preference is saved. Non-blocking, fire-and-forget.
  app.addHook('onReady', () => {
    void autoProbeAndFallback();
    return Promise.resolve();
  });

  // GET /api/v1/telemetry/status — Returns current provider health & active source
  app.get('/status', async () => {
    await syncProviderModeFromRedis();
    const provider = getTelemetryProvider();
    const status = await provider.getStatus();
    return { success: true, data: status };
  });

  // POST /api/v1/telemetry/provider — Switch active telemetry provider (otel, mock, replay)
  app.post<{ Body: { provider: ProviderMode } }>('/provider', async (request, reply) => {
    const { provider } = request.body ?? {};

    if (provider !== 'mock' && provider !== 'replay' && provider !== 'otel') {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_PROVIDER', message: 'Provider must be otel, mock, or replay' },
      });
    }

    try {
      await redis.set(REDIS_KEY, provider);
    } catch {
      // Ignore Redis error
    }

    const active = setTelemetryProviderMode(provider);
    const status = await active.getStatus();
    return { success: true, data: status };
  });

  // POST /api/v1/telemetry/demo/override — Set dynamic metric override for live demo verification
  app.post<{ Body: { serviceName: string; rps?: number; errorRate?: number; latencyP99?: number } }>(
    '/demo/override',
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

  // POST /api/v1/telemetry/record/start — Start recording live telemetry frames
  app.post<{ Body: { title?: string } }>('/record/start', async (request) => {
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

  // POST /api/v1/telemetry/record/stop — Stop recording and save snapshot
  app.post('/record/stop', async () => {
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

  // POST /api/v1/telemetry/replay/start — Start replaying loaded recording
  app.post('/replay/start', async () => {
    try {
      await redis.set(REDIS_KEY, 'replay');
    } catch {
      // Ignore Redis error
    }

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
