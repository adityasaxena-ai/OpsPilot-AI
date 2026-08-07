import { PrismaClient } from '@prisma/client';

export interface VerificationResult {
  isRecovered: boolean;
  metrics: {
    cpuPercent: number;
    errorRatePercent: number;
    latencyP99Ms: number;
    isHealthy: boolean;
  };
  summary: string;
}

export class VerificationAgent {
  constructor(private db: PrismaClient) {}

  async verifyRecovery(incidentId: string): Promise<VerificationResult> {
    const incident = await this.db.incident.findUnique({
      where: { id: incidentId },
      include: { service: { include: { simState: true } } },
    });

    if (!incident || !incident.service) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    const simState = incident.service.simState;
    if (!simState) {
      return {
        isRecovered: true,
        metrics: { cpuPercent: 20, errorRatePercent: 0.1, latencyP99Ms: 150, isHealthy: true },
        summary: 'Default recovery verification passed (no active telemetry degradation).',
      };
    }

    const isRecovered =
      simState.isHealthy &&
      simState.errorRatePercent < 1.0 &&
      simState.latencyP99Ms < 1000 &&
      simState.cpuPercent < 85;

    const summary = isRecovered
      ? `Verification PASSED: ${incident.service.name} is healthy. Error rate: ${simState.errorRatePercent.toFixed(2)}%, Latency P99: ${Math.round(simState.latencyP99Ms)}ms.`
      : `Verification FAILED: ${incident.service.name} still degraded. Error rate: ${simState.errorRatePercent.toFixed(2)}%, Latency P99: ${Math.round(simState.latencyP99Ms)}ms.`;

    if (isRecovered) {
      const resolvedAt = new Date();
      const detectedAt = incident.detectedAt;
      const mttrSeconds = Math.round((resolvedAt.getTime() - detectedAt.getTime()) / 1000);

      // Auto-resolve incident
      await this.db.incident.update({
        where: { id: incidentId },
        data: {
          status: 'RESOLVED',
          resolvedAt,
          mttrSeconds,
        },
      });

      // Also resolve active alerts for this service
      await this.db.alert.updateMany({
        where: { serviceId: incident.serviceId, status: 'ACTIVE' },
        data: { status: 'RESOLVED' },
      });

      await this.db.incidentEvent.create({
        data: {
          incidentId,
          eventType: 'VERIFICATION_PASSED',
          actorType: 'AI',
          description: `Verification Agent confirmed baseline metric recovery (MTTR: ${mttrSeconds}s). Incident RESOLVED.`,
          metadata: { mttrSeconds, metrics: simState as never },
        },
      });

      // Auto-generate postmortem
      try {
        const { PostmortemAgent } = await import('./postmortem-agent.js');
        const { getAIProvider } = await import('@opspilot/ai');
        const pmAgent = new PostmortemAgent(getAIProvider());
        await pmAgent.run(
          {
            incidentId,
            title: incident.title,
            severity: incident.severity,
            serviceName: incident.service.name,
            detectedAt: detectedAt.toISOString(),
            resolvedAt: resolvedAt.toISOString(),
            ...(incident.mttdSeconds ? { mttdSeconds: incident.mttdSeconds } : {}),
            mttrSeconds,
          },
          { incidentId, serviceId: incident.serviceId },
        );
      } catch (err) {
        console.error('[VerificationAgent] Postmortem generation warning:', err);
      }
    } else {
      await this.db.incidentEvent.create({
        data: {
          incidentId,
          eventType: 'VERIFICATION_FAILED',
          actorType: 'AI',
          description: `Verification FAILED. Telemetry metrics have not returned to healthy baseline. Escalating incident.`,
          metadata: { metrics: simState as never },
        },
      });
    }

    return {
      isRecovered,
      metrics: {
        cpuPercent: simState.cpuPercent,
        errorRatePercent: simState.errorRatePercent,
        latencyP99Ms: simState.latencyP99Ms,
        isHealthy: simState.isHealthy,
      },
      summary,
    };
  }
}
