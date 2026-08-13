import type { FastifyPluginAsync } from 'fastify';
import { getTelemetryProvider, canonicalTopology } from '@opspilot/telemetry';
import { db } from '../../lib/db.js';

export const topologyRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/topology — Returns the full ~75-component estate topology map
  app.get('/', async () => {
    let liveTelemetry: Record<string, any> = {};
    let telemetryStatus: { status: string; providerName: string } = {
      status: 'HEALTHY',
      providerName: 'OTEL',
    };

    try {
      const provider = getTelemetryProvider();
      const status = await provider.getStatus();
      telemetryStatus = {
        status: status.status,
        providerName: status.providerName,
      };

      liveTelemetry = await provider.fetchTelemetry([]);
    } catch {
      // Fallback if fetch telemetry fails
    }

    // Fetch active incidents from database
    let activeIncidents: any[] = [];
    try {
      const rawIncidents = await db.incident.findMany({
        where: {
          status: {
            notIn: ['CLOSED', 'RESOLVED'],
          },
        },
        select: {
          id: true,
          title: true,
          severity: true,
          status: true,
          serviceId: true,
          service: {
            select: {
              name: true,
            },
          },
          createdAt: true,
        },
      });

      activeIncidents = rawIncidents.map((inc) => ({
        ...inc,
        serviceName: inc.service?.name ?? inc.serviceId,
      }));
    } catch {
      // Ignore database errors if any
    }

    const topology = canonicalTopology.getTopology(liveTelemetry, activeIncidents, telemetryStatus);

    return {
      success: true,
      data: topology,
    };
  });

  // GET /api/v1/topology/components/:id — Returns deep component telemetry detail
  app.get<{ Params: { id: string } }>('/components/:id', async (request, reply) => {
    const { id } = request.params;

    let liveTelemetry: Record<string, any> = {};
    try {
      const provider = getTelemetryProvider();
      liveTelemetry = await provider.fetchTelemetry([]);
    } catch {
      // Fallback
    }

    let activeIncidents: any[] = [];
    try {
      const rawIncidents = await db.incident.findMany({
        where: {
          status: {
            notIn: ['CLOSED', 'RESOLVED'],
          },
        },
        include: {
          service: true,
        },
      });

      activeIncidents = rawIncidents.map((inc) => ({
        ...inc,
        serviceName: inc.service?.name ?? inc.serviceId,
      }));
    } catch {
      // Ignore
    }

    const detail = canonicalTopology.getComponentDetail(id, liveTelemetry, activeIncidents);

    if (!detail) {
      return reply.status(404).send({
        success: false,
        error: { code: 'COMPONENT_NOT_FOUND', message: `Component '${id}' not found in topology estate.` },
      });
    }

    return {
      success: true,
      data: detail,
    };
  });
};
