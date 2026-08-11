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

export const telemetryRoutes: FastifyPluginAsync = async (app) => {
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
