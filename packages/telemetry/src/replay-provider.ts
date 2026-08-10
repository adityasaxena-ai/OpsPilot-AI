import { TelemetryProvider, ServiceTelemetry, TelemetryStatus, TelemetryRecording, TelemetryRecordingFrame } from './provider.js';

export class ReplayTelemetryProvider implements TelemetryProvider {
  readonly name = 'replay';
  private recording: TelemetryRecording | null = null;
  private currentFrameIndex = 0;
  private isRecording = false;
  private recordedFrames: TelemetryRecordingFrame[] = [];
  private recordingStartTime = 0;
  private recordingTitle = '';

  constructor(initialRecording?: TelemetryRecording) {
    if (initialRecording) {
      this.recording = initialRecording;
    } else {
      this.recording = this.createSampleRecording();
    }
  }

  ensureRecording(): void {
    if (!this.recording) {
      this.recording = this.createSampleRecording();
    }
  }

  private createSampleRecording(): TelemetryRecording {
    const serviceIds = ['payments-api', 'fraud-engine', 'auth-service', 'payment-db', 'redis-cache'];
    const frames: TelemetryRecordingFrame[] = [];
    const now = Date.now();

    for (let f = 0; f < 5; f++) {
      const metrics: Record<string, ServiceTelemetry> = {};
      for (const serviceId of serviceIds) {
        const isFraud = serviceId === 'fraud-engine';
        const isPayments = serviceId === 'payments-api';
        const cpu = isFraud ? 45 + f * 10 : 20 + f * 2;
        const latency = isFraud ? 120 + f * 150 : isPayments ? 40 + f * 15 : 30 + f * 5;
        const errRate = isFraud && f >= 3 ? 8.5 : 0.1;

        metrics[serviceId] = {
          serviceId,
          serviceName: serviceId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          cpuPercent: Math.min(98, cpu),
          memoryPercent: 35 + f * 3,
          latencyP50Ms: Math.round(latency * 0.4),
          latencyP95Ms: Math.round(latency * 0.8),
          latencyP99Ms: latency,
          errorRatePercent: errRate,
          throughputRps: 150 - f * 10,
          dbConnectionsActive: 10 + f * 2,
          queueDepth: f * 3,
          isHealthy: errRate < 5.0 && latency < 1000,
          timestamp: new Date(now - (5 - f) * 10000).toISOString(),
        };
      }
      frames.push({
        timestamp: new Date(now - (5 - f) * 10000).toISOString(),
        metrics,
      });
    }

    return {
      id: 'sample_built_in_recording',
      title: 'Production Telemetry Incident Replay (Sample)',
      recordedAt: new Date().toISOString(),
      frameCount: frames.length,
      durationSeconds: 50,
      frames,
    };
  }

  loadRecording(recording: TelemetryRecording): void {
    this.recording = recording;
    this.currentFrameIndex = 0;
  }

  startRecording(title: string): void {
    this.isRecording = true;
    this.recordedFrames = [];
    this.recordingStartTime = Date.now();
    this.recordingTitle = title;
  }

  stopRecording(): TelemetryRecording {
    this.isRecording = false;
    const durationSeconds = Math.round((Date.now() - this.recordingStartTime) / 1000);
    const snapshot: TelemetryRecording = {
      id: `rec_${Date.now()}`,
      title: this.recordingTitle || 'Telemetry Stream Recording',
      recordedAt: new Date().toISOString(),
      frameCount: this.recordedFrames.length,
      durationSeconds,
      frames: [...this.recordedFrames],
    };

    this.recording = snapshot;
    return snapshot;
  }

  async getStatus(): Promise<TelemetryStatus> {
    this.ensureRecording();
    const title = this.recording?.title ?? 'Production Telemetry Incident Replay (Sample)';
    const totalFrames = this.recording?.frameCount ?? 5;
    return {
      providerName: this.name,
      status: 'HEALTHY',
      activeSource: this.isRecording
        ? `Recording live stream ("${this.recordingTitle}")`
        : `Replaying recording "${title}" (Frame ${this.currentFrameIndex + 1}/${totalFrames})`,
      isReplaying: !this.isRecording,
      isRecording: this.isRecording,
      lastUpdated: new Date().toISOString(),
      details: {
        currentFrame: this.currentFrameIndex,
        totalFrames,
      },
    };
  }

  async fetchTelemetry(serviceIds: string[]): Promise<Record<string, ServiceTelemetry>> {
    // If no recording is loaded, fallback to clean baseline frame
    if (!this.recording || this.recording.frames.length === 0) {
      return this.generateBaselineFrame(serviceIds);
    }

    // Get current frame and advance index (loop around if reached end)
    const frame = this.recording.frames[this.currentFrameIndex % this.recording.frames.length];
    if (!frame) {
      return this.generateBaselineFrame(serviceIds);
    }

    this.currentFrameIndex = (this.currentFrameIndex + 1) % this.recording.frames.length;

    // Return mapped metrics with updated timestamp
    const now = new Date().toISOString();
    const result: Record<string, ServiceTelemetry> = {};

    for (const [key, metric] of Object.entries(frame.metrics)) {
      result[key] = {
        ...metric,
        timestamp: now,
      };
    }

    return result;
  }

  recordFrame(metrics: Record<string, ServiceTelemetry>): void {
    if (!this.isRecording) return;
    this.recordedFrames.push({
      timestamp: new Date().toISOString(),
      metrics,
    });
  }

  private generateBaselineFrame(serviceIds: string[]): Record<string, ServiceTelemetry> {
    const result: Record<string, ServiceTelemetry> = {};
    const timestamp = new Date().toISOString();

    for (const id of serviceIds) {
      result[id] = {
        serviceId: id,
        serviceName: id,
        cpuPercent: 20,
        memoryPercent: 35,
        latencyP50Ms: 45,
        latencyP95Ms: 90,
        latencyP99Ms: 130,
        errorRatePercent: 0.1,
        throughputRps: 180,
        dbConnectionsActive: 8,
        queueDepth: 2,
        isHealthy: true,
        timestamp,
      };
    }

    return result;
  }
}
