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
    }
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
    return {
      providerName: this.name,
      status: 'HEALTHY',
      activeSource: this.isRecording
        ? `Recording live stream ("${this.recordingTitle}")`
        : this.recording
        ? `Replaying recording "${this.recording.title}" (Frame ${this.currentFrameIndex + 1}/${this.recording.frameCount})`
        : 'Standby (No recording loaded)',
      isReplaying: !!this.recording && !this.isRecording,
      isRecording: this.isRecording,
      lastUpdated: new Date().toISOString(),
      details: {
        currentFrame: this.currentFrameIndex,
        totalFrames: this.recording?.frameCount ?? 0,
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
