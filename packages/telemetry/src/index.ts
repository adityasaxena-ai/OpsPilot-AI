import { TelemetryProvider } from './provider.js';
import { OpenTelemetryProvider } from './otel-provider.js';
import { MockTelemetryProvider } from './mock-provider.js';
import { ReplayTelemetryProvider } from './replay-provider.js';

export * from './provider.js';
export * from './otel-provider.js';
export * from './mock-provider.js';
export * from './replay-provider.js';
export * from './service-mapper.js';

let activeProvider: TelemetryProvider | null = null;
const replayProvider = new ReplayTelemetryProvider();
const mockProvider = new MockTelemetryProvider();
const otelProvider = new OpenTelemetryProvider();

export function getTelemetryProvider(): TelemetryProvider {
  if (activeProvider) return activeProvider;

  const mode = process.env['TELEMETRY_PROVIDER'] ?? 'otel';

  if (mode === 'replay') {
    activeProvider = replayProvider;
  } else if (mode === 'mock') {
    activeProvider = mockProvider;
  } else {
    activeProvider = otelProvider;
  }

  return activeProvider;
}

export function setTelemetryProvider(provider: TelemetryProvider): void {
  activeProvider = provider;
}

export function getReplayProvider(): ReplayTelemetryProvider {
  return replayProvider;
}
