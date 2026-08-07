import { z } from 'zod';

// ─────────────────────────────────────────────
// Enumerations
// ─────────────────────────────────────────────

export const SeveritySchema = z.enum(['P1', 'P2', 'P3', 'P4', 'P5']);
export type Severity = z.infer<typeof SeveritySchema>;

export const ImpactSchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
export type Impact = z.infer<typeof ImpactSchema>;

export const EnvironmentSchema = z.enum(['production', 'staging', 'development']);
export type Environment = z.infer<typeof EnvironmentSchema>;

export const ServiceTierSchema = z.enum(['1', '2', '3']);
export type ServiceTier = z.infer<typeof ServiceTierSchema>;

export const ServiceStatusSchema = z.enum(['HEALTHY', 'DEGRADED', 'DOWN', 'UNKNOWN']);
export type ServiceStatus = z.infer<typeof ServiceStatusSchema>;

export const AlertStatusSchema = z.enum(['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'SUPPRESSED']);
export type AlertStatus = z.infer<typeof AlertStatusSchema>;

export const IncidentStatusSchema = z.enum([
  'DETECTED',
  'TRIAGED',
  'CORRELATED',
  'INVESTIGATING',
  'RCA_IDENTIFIED',
  'REMEDIATION_PROPOSED',
  'AWAITING_APPROVAL',
  'EXECUTING',
  'VERIFYING',
  'RESOLVED',
  'FAILED',
  'ESCALATED',
  'LEARNING',
]);
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;

export const EvidenceTypeSchema = z.enum([
  'METRIC',
  'LOG',
  'TRACE',
  'DEPLOYMENT',
  'CHANGE',
  'HISTORICAL_INCIDENT',
  'RUNBOOK',
]);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

export const RemediationActionTypeSchema = z.enum([
  'RESTART_SERVICE',
  'SCALE_SERVICE',
  'ROLLBACK_DEPLOYMENT',
  'RETRY_BATCH',
  'CLEAR_CACHE',
]);
export type RemediationActionType = z.infer<typeof RemediationActionTypeSchema>;

export const RemediationStatusSchema = z.enum([
  'PROPOSED',
  'AWAITING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'EXECUTING',
  'SUCCEEDED',
  'FAILED',
  'ROLLED_BACK',
]);
export type RemediationStatus = z.infer<typeof RemediationStatusSchema>;

export const RiskLevelSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const UserRoleSchema = z.enum(['VIEWER', 'OPERATOR', 'INCIDENT_COMMANDER', 'ADMIN']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const ActorTypeSchema = z.enum(['USER', 'AI', 'SYSTEM', 'SIMULATOR']);
export type ActorType = z.infer<typeof ActorTypeSchema>;

export const ApprovalStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ChaosScenarioSchema = z.enum([
  'BAD_DEPLOYMENT',
  'HIGH_CPU',
  'MEMORY_LEAK',
  'DB_CONNECTION_EXHAUSTION',
  'API_LATENCY',
  'QUEUE_BACKLOG',
  'BATCH_FAILURE',
  'DISK_FULL',
  'DEPENDENCY_FAILURE',
  'CERT_EXPIRY',
]);
export type ChaosScenario = z.infer<typeof ChaosScenarioSchema>;

// ─────────────────────────────────────────────
// Canonical Event
// ─────────────────────────────────────────────

export const CanonicalEventSchema = z.object({
  id: z.string(),
  source: z.string(),
  eventType: z.enum(['ALERT', 'METRIC', 'LOG', 'DEPLOYMENT', 'CHANGE', 'HEALTH']),
  severity: SeveritySchema,
  serviceId: z.string(),
  environment: EnvironmentSchema,
  timestamp: z.string().datetime(),
  fingerprint: z.string(),
  labels: z.record(z.string()),
  payload: z.record(z.unknown()),
});
export type CanonicalEvent = z.infer<typeof CanonicalEventSchema>;

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

export const ServiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  tier: ServiceTierSchema,
  environment: EnvironmentSchema,
  ownerTeam: z.string(),
  ownerEmail: z.string().email(),
  status: ServiceStatusSchema,
  healthScore: z.number().min(0).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Service = z.infer<typeof ServiceSchema>;

export const ServiceHealthSchema = z.object({
  serviceId: z.string(),
  status: ServiceStatusSchema,
  healthScore: z.number().min(0).max(100),
  cpuPercent: z.number(),
  memoryPercent: z.number(),
  latencyP50Ms: z.number(),
  latencyP99Ms: z.number(),
  errorRatePercent: z.number(),
  throughputRps: z.number(),
  dbConnectionsActive: z.number().optional(),
  dbConnectionsMax: z.number().optional(),
  queueDepth: z.number().optional(),
  updatedAt: z.string().datetime(),
});
export type ServiceHealth = z.infer<typeof ServiceHealthSchema>;

// ─────────────────────────────────────────────
// Alert
// ─────────────────────────────────────────────

export const AlertSchema = z.object({
  id: z.string(),
  eventId: z.string().optional(),
  serviceId: z.string(),
  title: z.string(),
  description: z.string(),
  severity: SeveritySchema,
  status: AlertStatusSchema,
  fingerprint: z.string(),
  labels: z.record(z.string()),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  occurrenceCount: z.number().int().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Alert = z.infer<typeof AlertSchema>;

// ─────────────────────────────────────────────
// Incident
// ─────────────────────────────────────────────

export const IncidentSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  severity: SeveritySchema,
  status: IncidentStatusSchema,
  serviceId: z.string(),
  environment: EnvironmentSchema,
  assignedToId: z.string().nullable(),
  aiTriageConfidence: z.number().min(0).max(1).nullable(),
  aiTriageResult: z.record(z.unknown()).nullable(),
  rcaResult: z.record(z.unknown()).nullable(),
  detectedAt: z.string().datetime(),
  triagedAt: z.string().datetime().nullable(),
  resolvedAt: z.string().datetime().nullable(),
  mttdSeconds: z.number().int().nullable(),
  mttaSeconds: z.number().int().nullable(),
  mttrSeconds: z.number().int().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Incident = z.infer<typeof IncidentSchema>;

export const IncidentEventSchema = z.object({
  id: z.string(),
  incidentId: z.string(),
  eventType: z.string(),
  actorId: z.string().nullable(),
  actorType: ActorTypeSchema,
  description: z.string(),
  metadata: z.record(z.unknown()),
  createdAt: z.string().datetime(),
});
export type IncidentEvent = z.infer<typeof IncidentEventSchema>;

// ─────────────────────────────────────────────
// Evidence
// ─────────────────────────────────────────────

export const EvidenceSchema = z.object({
  id: z.string(),
  incidentId: z.string(),
  evidenceType: EvidenceTypeSchema,
  source: z.string(),
  title: z.string(),
  content: z.string(),
  data: z.record(z.unknown()),
  relevanceScore: z.number().min(0).max(1),
  collectedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

// ─────────────────────────────────────────────
// AI / Agents
// ─────────────────────────────────────────────

export const TriageResultSchema = z.object({
  severity: SeveritySchema,
  impact: ImpactSchema,
  affectedService: z.string(),
  businessImpact: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type TriageResult = z.infer<typeof TriageResultSchema>;

export const RCAResultSchema = z.object({
  probableCause: z.string(),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string()),
  recommendedActions: z.array(RemediationActionTypeSchema),
  alternativeCauses: z.array(z.string()),
  supportingContext: z.string(),
});
export type RCAResult = z.infer<typeof RCAResultSchema>;

// ─────────────────────────────────────────────
// Remediation
// ─────────────────────────────────────────────

export const RemediationActionSchema = z.object({
  id: z.string(),
  incidentId: z.string(),
  actionType: RemediationActionTypeSchema,
  actionParams: z.record(z.unknown()),
  status: RemediationStatusSchema,
  riskScore: z.number().int().min(0).max(100),
  riskLevel: RiskLevelSchema,
  riskFactors: z.record(z.number()),
  proposedByAi: z.boolean(),
  proposedAt: z.string().datetime(),
  executedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  executionLog: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RemediationAction = z.infer<typeof RemediationActionSchema>;

// ─────────────────────────────────────────────
// Simulator
// ─────────────────────────────────────────────

export const SimulatorServiceStateSchema = z.object({
  serviceId: z.string(),
  cpuPercent: z.number(),
  memoryPercent: z.number(),
  latencyP50Ms: z.number(),
  latencyP99Ms: z.number(),
  errorRatePercent: z.number(),
  throughputRps: z.number(),
  dbConnectionsActive: z.number(),
  dbConnectionsMax: z.number(),
  queueDepth: z.number(),
  isHealthy: z.boolean(),
  failureScenario: ChaosScenarioSchema.nullable(),
  failureStartedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});
export type SimulatorServiceState = z.infer<typeof SimulatorServiceStateSchema>;

export const ChaosInjectionRequestSchema = z.object({
  serviceId: z.string(),
  scenario: ChaosScenarioSchema,
  durationSeconds: z.number().int().min(30).max(3600).optional().default(300),
});
export type ChaosInjectionRequest = z.infer<typeof ChaosInjectionRequestSchema>;

// ─────────────────────────────────────────────
// API Common
// ─────────────────────────────────────────────

export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema,
    meta: z
      .object({
        total: z.number().int().optional(),
        limit: z.number().int().optional(),
        offset: z.number().int().optional(),
      })
      .optional(),
  });

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// ─────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────

export const OperationsMetricsSchema = z.object({
  mttdSeconds: z.number(),
  mttaSeconds: z.number(),
  mttrSeconds: z.number(),
  availabilityPercent: z.number(),
  activeIncidents: z.number().int(),
  resolvedToday: z.number().int(),
  alertsToday: z.number().int(),
  automationRate: z.number(),
  aiTriageRate: z.number(),
  sloCompliancePercent: z.number(),
});
export type OperationsMetrics = z.infer<typeof OperationsMetricsSchema>;
