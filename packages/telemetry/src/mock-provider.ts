import { TelemetryProvider, ServiceTelemetry, TelemetryStatus } from './provider.js';

export class MockTelemetryProvider implements TelemetryProvider {
  readonly name = 'mock';

  async getStatus(): Promise<TelemetryStatus> {
    return {
      providerName: this.name,
      status: 'HEALTHY',
      activeSource: 'OpsPilot Simulated Telemetry Stream (Demo Mode)',
      isReplaying: false,
      isRecording: false,
      lastUpdated: new Date().toISOString(),
    };
  }

  async fetchTelemetry(serviceIds: string[]): Promise<Record<string, ServiceTelemetry>> {
    const result: Record<string, ServiceTelemetry> = {};
    const timestamp = new Date().toISOString();

    for (const id of serviceIds) {
      result[id] = {
        serviceId: id,
        serviceName: id,
        cpuPercent: Math.round(Math.random() * 25 + 15),
        memoryPercent: Math.round(Math.random() * 20 + 35),
        latencyP50Ms: Math.round(Math.random() * 30 + 40),
        latencyP95Ms: Math.round(Math.random() * 60 + 100),
        latencyP99Ms: Math.round(Math.random() * 80 + 140),
        errorRatePercent: parseFloat((Math.random() * 0.5).toFixed(2)),
        throughputRps: Math.round(Math.random() * 100 + 150),
        dbConnectionsActive: Math.round(Math.random() * 10 + 5),
        queueDepth: Math.round(Math.random() * 5),
        isHealthy: true,
        timestamp,
      };
    }

    return result;
  }
}
