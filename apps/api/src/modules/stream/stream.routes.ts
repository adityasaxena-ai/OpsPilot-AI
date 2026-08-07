import type { FastifyPluginAsync } from 'fastify';
import { sseEmitter } from '../../lib/sse.js';
import { db } from '../../lib/db.js';

export const streamRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /api/v1/stream/incidents
   * Real-time incident updates via Server-Sent Events
   */
  app.get('/incidents', async (request, reply) => {
    void reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const sendEvent = (eventName: string, data: unknown) => {
      reply.raw.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Send current state immediately on connect
    const activeIncidents = await db.incident.findMany({
      where: { status: { notIn: ['RESOLVED', 'FAILED'] } },
      include: { service: { select: { id: true, name: true, slug: true } } },
      orderBy: { detectedAt: 'desc' },
      take: 50,
    });
    sendEvent('snapshot', activeIncidents);

    const onCreated = (data: unknown) => sendEvent('incident_created', data);
    const onUpdated = (data: unknown) => sendEvent('incident_updated', data);

    sseEmitter.on('incident_created', onCreated);
    sseEmitter.on('incident_updated', onUpdated);

    // Heartbeat every 30s
    const heartbeat = setInterval(() => {
      reply.raw.write(': heartbeat\n\n');
    }, 30_000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      sseEmitter.off('incident_created', onCreated);
      sseEmitter.off('incident_updated', onUpdated);
    });

    // Keep connection open
    await new Promise<void>((resolve) => {
      request.raw.on('close', resolve);
    });
  });

  /**
   * GET /api/v1/stream/alerts
   * Real-time alert feed
   */
  app.get('/alerts', async (request, reply) => {
    void reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const sendEvent = (eventName: string, data: unknown) => {
      reply.raw.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const onAlert = (data: unknown) => sendEvent('alert', data);
    sseEmitter.on('alert_created', onAlert);

    const heartbeat = setInterval(() => {
      reply.raw.write(': heartbeat\n\n');
    }, 30_000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      sseEmitter.off('alert_created', onAlert);
    });

    await new Promise<void>((resolve) => {
      request.raw.on('close', resolve);
    });
  });

  /**
   * GET /api/v1/stream/metrics/:serviceId
   * Real-time service metrics (pushed every simulator tick)
   */
  app.get<{ Params: { serviceId: string } }>('/metrics/:serviceId', async (request, reply) => {
    const { serviceId } = request.params;

    void reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const sendMetrics = (data: unknown) => {
      reply.raw.write(`event: metrics\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Send current state immediately
    const current = await db.simService.findUnique({ where: { serviceId } });
    if (current) sendMetrics(current);

    const onMetrics = (data: unknown) => {
      const payload = data as { serviceId: string };
      if (payload.serviceId === serviceId) {
        void db.simService.findUnique({ where: { serviceId } }).then((state) => {
          if (state) sendMetrics(state);
        });
      }
    };

    sseEmitter.on('metrics_updated', onMetrics);

    const heartbeat = setInterval(() => {
      reply.raw.write(': heartbeat\n\n');
    }, 30_000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      sseEmitter.off('metrics_updated', onMetrics);
    });

    await new Promise<void>((resolve) => {
      request.raw.on('close', resolve);
    });
  });
};
