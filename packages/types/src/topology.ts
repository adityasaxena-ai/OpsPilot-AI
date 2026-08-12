import { z } from 'zod';

export const EstateComponentLayerSchema = z.enum([
  'CHANNELS',
  'API_INTEGRATION',
  'BUSINESS_SERVICES',
  'DATA',
  'EXTERNAL_DEPENDENCIES',
  'PLATFORM_INFRASTRUCTURE',
]);
export type EstateComponentLayer = z.infer<typeof EstateComponentLayerSchema>;

export const ComponentHealthStatusSchema = z.enum(['GREEN', 'AMBER', 'RED', 'UNKNOWN']);
export type ComponentHealthStatus = z.infer<typeof ComponentHealthStatusSchema>;

export interface EstateMetrics {
  throughputRps: number;
  latencyP99Ms: number;
  errorRatePercent: number;
  cpuPercent?: number;
  memoryPercent?: number;
  activeConnections?: number;
}

export interface EstateNode {
  id: string;
  name: string;
  layer: EstateComponentLayer;
  layerLabel: string;
  type: string;
  health: ComponentHealthStatus;
  metrics: EstateMetrics;
  activeIncidentCount: number;
  position: { x: number; y: number };
  description?: string;
  icon?: string;
}

export interface EstateEdge {
  id: string;
  source: string;
  target: string;
  transactionType: string;
  health: ComponentHealthStatus;
  throughputRps: number;
  errorRatePercent: number;
  label?: string;
}

export interface EstateTopologySummary {
  totalComponents: number;
  greenCount: number;
  amberCount: number;
  redCount: number;
  unknownCount: number;
  activeIncidents: number;
  totalRps: number;
  telemetryProvider: string;
  telemetryStatus: string;
  lastUpdated: string;
}

export interface EstateTopologyResponse {
  summary: EstateTopologySummary;
  nodes: EstateNode[];
  edges: EstateEdge[];
}

export interface ComponentDependencyRef {
  id: string;
  name: string;
  layer: EstateComponentLayer;
  health: ComponentHealthStatus;
  relationshipType: string;
}

export interface ComponentDetail {
  node: EstateNode;
  activeIncidents: any[];
  upstreamDependencies: ComponentDependencyRef[];
  downstreamDependents: ComponentDependencyRef[];
  telemetryHistory: Array<{
    timestamp: string;
    rps: number;
    latencyP99Ms: number;
    errorRatePercent: number;
    cpuPercent: number;
    memoryPercent: number;
  }>;
  blastRadius?: BlastRadiusInfo;
  transactionTypes?: Array<{ type: string; rps: number; percentage: number }>;
}

export type TransactionType =
  | 'PAYMENTS'
  | 'LOGINS'
  | 'BALANCE_INQUIRY'
  | 'TRANSFERS'
  | 'CARD_AUTH'
  | 'FRAUD_CHECK'
  | 'ATM_TRANSACTION'
  | 'NOTIFICATION';

export interface BlastRadiusInfo {
  rootCauseComponentId: string;
  rootCauseComponentName: string;
  directImpactCount: number;
  downstreamImpactCount: number;
  upstreamImpactCount: number;
  totalImpactedComponentsCount: number;
  totalImpactedRps: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  affectedComponentIds: string[];
}

export interface EstateChaosScenario {
  id: string;
  name: string;
  description: string;
  targetComponentId: string;
  targetComponentName: string;
  health: ComponentHealthStatus;
  metricsOverride: {
    latencyP99Ms?: number;
    errorRatePercent?: number;
    throughputRps?: number;
    cpuPercent?: number;
  };
  expectedDownstreamImpact: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export const CHAOS_SCENARIOS: EstateChaosScenario[] = [
  {
    id: 'payment-db-latency',
    name: '1. Payment DB Latency Spike',
    description: 'Database lock contention in Payment DB causing latency P99 to spike to 1500ms.',
    targetComponentId: 'payment-db',
    targetComponentName: 'Payment DB',
    health: 'RED',
    metricsOverride: { latencyP99Ms: 1500, errorRatePercent: 8.0, cpuPercent: 92 },
    expectedDownstreamImpact: ['payments-service', 'bff-web-gateway', 'web-portal'],
    riskLevel: 'CRITICAL',
  },
  {
    id: 'payment-api-errors',
    name: '2. Payment API 5xx Spike',
    description: 'Uncaught null reference exception in Payments API resulting in 25% 5xx error rate.',
    targetComponentId: 'payments-service',
    targetComponentName: 'Payments Microservice',
    health: 'RED',
    metricsOverride: { errorRatePercent: 25.0, latencyP99Ms: 950, cpuPercent: 88 },
    expectedDownstreamImpact: ['bff-web-gateway', 'web-portal'],
    riskLevel: 'CRITICAL',
  },
  {
    id: 'auth-failure',
    name: '3. Authentication Failure Cascade',
    description: 'Token validation service timeout causing 35% login authentication failures.',
    targetComponentId: 'auth-service',
    targetComponentName: 'Auth Service',
    health: 'RED',
    metricsOverride: { errorRatePercent: 35.0, latencyP99Ms: 1200, cpuPercent: 95 },
    expectedDownstreamImpact: ['api-gateway', 'mobile-banking', 'web-portal'],
    riskLevel: 'CRITICAL',
  },
  {
    id: 'redis-outage',
    name: '4. Redis Cache Eviction Storm',
    description: 'Redis memory maxout causing cash miss storm and 2000ms latency spikes.',
    targetComponentId: 'redis-cache',
    targetComponentName: 'Redis Cache Cluster',
    health: 'AMBER',
    metricsOverride: { latencyP99Ms: 2000, errorRatePercent: 5.5, cpuPercent: 99 },
    expectedDownstreamImpact: ['customer-api', 'account-service'],
    riskLevel: 'HIGH',
  },
  {
    id: 'kafka-backlog',
    name: '5. Kafka Consumer Lag',
    description: 'Partition rebalance stuck causing 1200ms message delivery delays.',
    targetComponentId: 'kafka-event-bus',
    targetComponentName: 'Kafka Event Bus',
    health: 'AMBER',
    metricsOverride: { latencyP99Ms: 1200, errorRatePercent: 3.0, cpuPercent: 82 },
    expectedDownstreamImpact: ['notification-service', 'audit-trail-service'],
    riskLevel: 'MEDIUM',
  },
  {
    id: 'external-gateway-failure',
    name: '6. Visa Payment Gateway Outage',
    description: 'External Visa partner API timeouts resulting in 45% card authorization drops.',
    targetComponentId: 'ext-visa-gateway',
    targetComponentName: 'Visa Payment Gateway',
    health: 'RED',
    metricsOverride: { errorRatePercent: 45.0, latencyP99Ms: 2500 },
    expectedDownstreamImpact: ['cards-processing-service', 'payments-service'],
    riskLevel: 'CRITICAL',
  },
  {
    id: 'cpu-saturation',
    name: '7. Core Banking CPU Saturation',
    description: 'End-of-day batch processing consuming 98% CPU on Core Banking Engine.',
    targetComponentId: 'core-banking-ledger',
    targetComponentName: 'Account Ledger Service',
    health: 'AMBER',
    metricsOverride: { cpuPercent: 98, latencyP99Ms: 1400, errorRatePercent: 4.0 },
    expectedDownstreamImpact: ['data-warehouse', 'timescale-db'],
    riskLevel: 'HIGH',
  },
  {
    id: 'network-latency',
    name: '8. API Gateway Throttling',
    description: 'DDoS mitigation rate-limiter throttling legitimate channel traffic.',
    targetComponentId: 'api-gateway',
    targetComponentName: 'API Gateway',
    health: 'AMBER',
    metricsOverride: { latencyP99Ms: 1800, errorRatePercent: 12.0 },
    expectedDownstreamImpact: ['mobile-banking', 'web-portal', 'atm-terminal'],
    riskLevel: 'HIGH',
  },
  {
    id: 'fraud-engine-failure',
    name: '9. Fraud Engine Timeout',
    description: 'ML model inference latency stalling fraud evaluation for credit transactions.',
    targetComponentId: 'fraud-detection-engine',
    targetComponentName: 'Fraud Engine',
    health: 'RED',
    metricsOverride: { errorRatePercent: 50.0, latencyP99Ms: 1100 },
    expectedDownstreamImpact: ['payments-service', 'cards-processing-service'],
    riskLevel: 'HIGH',
  },
];
