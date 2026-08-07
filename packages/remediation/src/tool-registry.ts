import { PrismaClient } from '@prisma/client';

export interface ExecutionResult {
  success: boolean;
  message: string;
  executionLog: string;
  rollbackLog?: string;
}

export interface RemediationTool {
  actionType: string;
  name: string;
  description: string;
  execute(serviceId: string, params: Record<string, unknown>, db: PrismaClient): Promise<ExecutionResult>;
  rollback?(serviceId: string, db: PrismaClient): Promise<ExecutionResult>;
}

export class ToolRegistry {
  private tools = new Map<string, RemediationTool>();

  constructor() {
    this.registerDefaults();
  }

  register(tool: RemediationTool): void {
    this.tools.set(tool.actionType, tool);
  }

  get(actionType: string): RemediationTool | undefined {
    return this.tools.get(actionType);
  }

  list(): RemediationTool[] {
    return Array.from(this.tools.values());
  }

  private registerDefaults(): void {
    // 1. ROLLBACK_DEPLOYMENT
    this.register({
      actionType: 'ROLLBACK_DEPLOYMENT',
      name: 'Rollback Deployment',
      description: 'Rolls back the affected microservice to the previous stable release.',
      execute: async (serviceId, _params, db) => {
        // Clear failure scenario and mark simService healthy
        await db.simService.updateMany({
          where: { serviceId },
          data: {
            failureScenario: null,
            failureStartedAt: null,
            isHealthy: true,
            cpuPercent: 25,
            memoryPercent: 40,
            errorRatePercent: 0.1,
            latencyP99Ms: 150,
            latencyP50Ms: 50,
          },
        });

        // Mark bad deployment as rolled back
        await db.simDeployment.updateMany({
          where: { serviceId, isBadDeployment: true },
          data: { isBadDeployment: false },
        });

        return {
          success: true,
          message: `Successfully rolled back deployment for service ${serviceId}`,
          executionLog: `[EXECUTION] Triggered automated rollback on ${serviceId}. Restored image artifact to previous commit tag. Metric baselines recovered.`,
        };
      },
    });

    // 2. RESTART_SERVICE
    this.register({
      actionType: 'RESTART_SERVICE',
      name: 'Restart Service',
      description: 'Performs a rolling restart of all service instances to flush transient state.',
      execute: async (serviceId, _params, db) => {
        await db.simService.updateMany({
          where: { serviceId },
          data: {
            failureScenario: null,
            failureStartedAt: null,
            isHealthy: true,
            cpuPercent: 20,
            memoryPercent: 35,
            errorRatePercent: 0.1,
            latencyP99Ms: 140,
            dbConnectionsActive: 10,
          },
        });

        return {
          success: true,
          message: `Successfully restarted service instances for ${serviceId}`,
          executionLog: `[EXECUTION] Performed rolling restart of pods for ${serviceId}. Memory heap and connection pools flushed.`,
        };
      },
    });

    // 3. SCALE_SERVICE
    this.register({
      actionType: 'SCALE_SERVICE',
      name: 'Scale Service',
      description: 'Scales out service replicas to handle incoming traffic volume.',
      execute: async (serviceId, _params, db) => {
        await db.simService.updateMany({
          where: { serviceId },
          data: {
            cpuPercent: 45,
            throughputRps: 250,
            isHealthy: true,
          },
        });

        return {
          success: true,
          message: `Successfully scaled out replicas for ${serviceId}`,
          executionLog: `[EXECUTION] Scaled target replica count +50% for ${serviceId}. CPU utilization normalized.`,
        };
      },
    });

    // 4. CLEAR_CACHE
    this.register({
      actionType: 'CLEAR_CACHE',
      name: 'Clear Cache',
      description: 'Flushes stale cache entries from Redis cache layer.',
      execute: async (serviceId, _params, db) => {
        await db.simService.updateMany({
          where: { serviceId },
          data: {
            latencyP99Ms: 120,
            latencyP50Ms: 40,
            isHealthy: true,
          },
        });

        return {
          success: true,
          message: `Successfully flushed Redis cache for ${serviceId}`,
          executionLog: `[EXECUTION] Executed FLUSHDB on target cache cluster for ${serviceId}. Latency restored.`,
        };
      },
    });

    // 5. RETRY_BATCH
    this.register({
      actionType: 'RETRY_BATCH',
      name: 'Retry Batch Job',
      description: 'Resets dead-letter queue and retries failed batch processing jobs.',
      execute: async (serviceId, _params, db) => {
        await db.simService.updateMany({
          where: { serviceId },
          data: {
            queueDepth: 0,
            errorRatePercent: 0.0,
            isHealthy: true,
          },
        });

        return {
          success: true,
          message: `Successfully retried failed batch job for ${serviceId}`,
          executionLog: `[EXECUTION] Re-enqueued dead-letter queue entries for ${serviceId}. Queue depth cleared.`,
        };
      },
    });
  }
}
