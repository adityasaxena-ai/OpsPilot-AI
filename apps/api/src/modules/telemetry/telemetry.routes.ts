import type { FastifyPluginAsync } from 'fastify';
import {
  getTelemetryProvider,
  setTelemetryProvider,
  getReplayProvider,
  OpenTelemetryProvider,
  MockTelemetryProvider,
} from '@opspilot/telemetry';

export const telemetryRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/telemetry/status — Returns current provider health & active source
  app.get('/status', async () => {
    const provider = getTelemetryProvider();
    const status = await provider.getStatus();
    return { success: true, data: status };
  });

  // POST /api/v1/telemetry/provider — Switch active telemetry provider (otel, mock, replay)
  app.post<{ Body: { provider: 'otel' | 'mock' | 'replay' } }>('/provider', async (request, reply) => {
    const { provider } = request.body ?? {};

    if (provider === 'mock') {
      setTelemetryProvider(new MockTelemetryProvider());
    } else if (provider === 'replay') {
      const replay = getReplayProvider();
      replay.ensureRecording();
      setTelemetryProvider(replay);
    } else if (provider === 'otel') {
      setTelemetryProvider(new OpenTelemetryProvider());
    } else {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_PROVIDER', message: 'Provider must be otel, mock, or replay' },
      });
    }

    const status = await getTelemetryProvider().getStatus();
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
    const replay = getReplayProvider();
    replay.ensureRecording();
    setTelemetryProvider(replay);

    const status = await replay.getStatus();
    return {
      success: true,
      data: status,
    };
  });
};
