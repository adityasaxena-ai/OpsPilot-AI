export interface ServiceTelemetry {
  serviceId: string;
  serviceName: string;
  cpuPercent: number;
  memoryPercent: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  errorRatePercent: number;
  throughputRps: number;
  dbConnectionsActive: number;
  queueDepth: number;
  isHealthy: boolean;
  timestamp: string;
}

export interface TelemetryStatus {
  providerName: 'otel' | 'mock' | 'replay' | string;
  status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
  activeSource: string;
  isReplaying: boolean;
  isRecording: boolean;
  lastUpdated: string;
  details?: Record<string, unknown>;
}

export interface TelemetryRecordingFrame {
  timestamp: string;
  metrics: Record<string, ServiceTelemetry>;
}

export interface TelemetryRecording {
  id: string;
  title: string;
  recordedAt: string;
  frameCount: number;
  durationSeconds: number;
  frames: TelemetryRecordingFrame[];
}

export interface TelemetryProvider {
  readonly name: string;
  getStatus(): Promise<TelemetryStatus>;
  fetchTelemetry(serviceIds: string[]): Promise<Record<string, ServiceTelemetry>>;
}
