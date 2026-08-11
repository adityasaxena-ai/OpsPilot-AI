import { TelemetryProvider } from './provider.js';
import { OpenTelemetryProvider } from './otel-provider.js';
import { MockTelemetryProvider } from './mock-provider.js';
import { ReplayTelemetryProvider } from './replay-provider.js';

export * from './provider.js';
export * from './otel-provider.js';
export * from './mock-provider.js';
export * from './replay-provider.js';
export * from './service-mapper.js';

export type ProviderMode = 'otel' | 'mock' | 'replay';

let currentMode: ProviderMode = (process.env['TELEMETRY_PROVIDER'] as ProviderMode) ?? 'otel';
const replayProvider = new ReplayTelemetryProvider();
const mockProvider = new MockTelemetryProvider();
const otelProvider = new OpenTelemetryProvider();

export function getTelemetryProviderByMode(mode: ProviderMode): TelemetryProvider {
  if (mode === 'replay') {
    replayProvider.ensureRecording();
    return replayProvider;
  }
  if (mode === 'mock') {
    return mockProvider;
  }
  return otelProvider;
}

export function getTelemetryProvider(): TelemetryProvider {
  return getTelemetryProviderByMode(currentMode);
}

export function getTelemetryProviderMode(): ProviderMode {
  return currentMode;
}

export function setTelemetryProviderMode(mode: ProviderMode): TelemetryProvider {
  currentMode = mode;
  return getTelemetryProviderByMode(mode);
}

export function setTelemetryProvider(provider: TelemetryProvider): void {
  if (provider.name === 'replay' || provider.name === 'mock' || provider.name === 'otel') {
    currentMode = provider.name as ProviderMode;
  }
}

export function getReplayProvider(): ReplayTelemetryProvider {
  replayProvider.ensureRecording();
  return replayProvider;
}
