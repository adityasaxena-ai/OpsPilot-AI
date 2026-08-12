import http from 'http';
import { ServiceMapper } from './service-mapper.js';

export interface OtelSdkConfig {
  collectorEndpoint?: string;
  flushIntervalMs?: number;
}

export class OtelLiveEmitter {
  private endpoint: string;
  private flushIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private serviceMapper = new ServiceMapper();
  private isRunning = false;
  private metricOverrides = new Map<string, { rps?: number; errorRate?: number; latencyP99?: number }>();

  constructor(config?: OtelSdkConfig) {
    this.endpoint = config?.collectorEndpoint ?? process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:4318';
    this.flushIntervalMs = config?.flushIntervalMs ?? 5000;
  }

  setOverride(serviceName: string, override: { rps?: number; errorRate?: number; latencyP99?: number } | null): void {
    if (!override) {
      this.metricOverrides.delete(serviceName.toLowerCase());
    } else {
      this.metricOverrides.set(serviceName.toLowerCase(), override);
    }
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Send immediate initial frame
    void this.emitMetrics();

    // Schedule continuous emitter loop
    this.timer = setInterval(() => {
      void this.emitMetrics();
    }, this.flushIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  async emitMetrics(): Promise<boolean> {
    const otelServices = this.serviceMapper.getRegisteredOtelServices();
    const nanoTime = String(Date.now()) + '000000';
    const dataPoints: any[] = [];

    for (const serviceName of otelServices) {
      const override = this.metricOverrides.get(serviceName.toLowerCase());
      const baseRps = override?.rps ?? Math.floor(Math.random() * 40 + 120);
      const errRate = override?.errorRate ?? 0.1;
      const baseLatency = override?.latencyP99 ?? Math.floor(Math.random() * 60 + 80);

      const errCount = Math.round(baseRps * (errRate / 100));
      const successCount = Math.max(1, baseRps - errCount);
      const totalCount = successCount + errCount;
      const totalSum = totalCount * baseLatency;

      // Success HTTP 200 data point
      dataPoints.push({
        attributes: [
          { key: 'service_name', value: { stringValue: serviceName } },
          { key: 'http_status_code', value: { stringValue: '200' } },
        ],
        timeUnixNano: nanoTime,
        count: String(successCount),
        sum: totalSum * 0.9,
        bucketCounts: [
          String(Math.round(successCount * 0.2)),
          String(Math.round(successCount * 0.5)),
          String(Math.round(successCount * 0.2)),
          String(Math.round(successCount * 0.1)),
        ],
        explicitBounds: [50.0, 100.0, 200.0, 500.0],
      });

      // Error HTTP 500 data point (if any errors present)
      if (errCount > 0) {
        dataPoints.push({
          attributes: [
            { key: 'service_name', value: { stringValue: serviceName } },
            { key: 'http_status_code', value: { stringValue: '500' } },
          ],
          timeUnixNano: nanoTime,
          count: String(errCount),
          sum: errCount * baseLatency * 1.5,
          bucketCounts: ['0', '0', String(Math.round(errCount * 0.3)), String(Math.round(errCount * 0.7))],
          explicitBounds: [50.0, 100.0, 200.0, 500.0],
        });
      }
    }

    const payload = JSON.stringify({
      resourceMetrics: [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'opspilot-api' } }],
          },
          scopeMetrics: [
            {
              scope: { name: 'opspilot-telemetry-sdk', version: '0.1.0' },
              metrics: [
                {
                  name: 'http_server_duration_milliseconds',
                  description: 'HTTP server request duration in milliseconds',
                  unit: 'ms',
                  histogram: {
                    dataPoints,
                    aggregationTemporality: 2,
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    return new Promise((resolve) => {
      try {
        const url = new URL('/v1/metrics', this.endpoint.startsWith('http') ? this.endpoint : `http://${this.endpoint}`);
        const req = http.request(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            },
            timeout: 3000,
          },
          (res) => {
            resolve(res.statusCode === 200);
          },
        );

        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });

        req.write(payload);
        req.end();
      } catch {
        resolve(false);
      }
    });
  }
}

export const globalOtelEmitter = new OtelLiveEmitter();
