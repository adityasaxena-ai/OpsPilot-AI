-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('P1', 'P2', 'P3', 'P4', 'P5');

-- CreateEnum
CREATE TYPE "Impact" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "Environment" AS ENUM ('production', 'staging', 'development');

-- CreateEnum
CREATE TYPE "ServiceTier" AS ENUM ('1', '2', '3');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'DOWN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('DETECTED', 'TRIAGED', 'CORRELATED', 'INVESTIGATING', 'RCA_IDENTIFIED', 'REMEDIATION_PROPOSED', 'AWAITING_APPROVAL', 'EXECUTING', 'VERIFYING', 'RESOLVED', 'FAILED', 'ESCALATED', 'LEARNING');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('METRIC', 'LOG', 'TRACE', 'DEPLOYMENT', 'CHANGE', 'HISTORICAL_INCIDENT', 'RUNBOOK');

-- CreateEnum
CREATE TYPE "RemediationActionType" AS ENUM ('RESTART_SERVICE', 'SCALE_SERVICE', 'ROLLBACK_DEPLOYMENT', 'RETRY_BATCH', 'CLEAR_CACHE');

-- CreateEnum
CREATE TYPE "RemediationStatus" AS ENUM ('PROPOSED', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('VIEWER', 'OPERATOR', 'INCIDENT_COMMANDER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'AI', 'SYSTEM', 'SIMULATOR');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('ALERT', 'METRIC', 'LOG', 'DEPLOYMENT', 'CHANGE', 'HEALTH');

-- CreateEnum
CREATE TYPE "ChaosScenario" AS ENUM ('BAD_DEPLOYMENT', 'HIGH_CPU', 'MEMORY_LEAK', 'DB_CONNECTION_EXHAUSTION', 'API_LATENCY', 'QUEUE_BACKLOG', 'BATCH_FAILURE', 'DISK_FULL', 'DEPENDENCY_FAILURE', 'CERT_EXPIRY');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tier" "ServiceTier" NOT NULL,
    "environment" "Environment" NOT NULL DEFAULT 'production',
    "owner_team" TEXT NOT NULL,
    "owner_email" TEXT NOT NULL,
    "status" "ServiceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "health_score" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_dependencies" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "depends_on_id" TEXT NOT NULL,
    "dependency_type" TEXT NOT NULL DEFAULT 'HARD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "event_type" "EventType" NOT NULL,
    "severity" "Severity" NOT NULL,
    "service_id" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "labels" JSONB NOT NULL DEFAULT '{}',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "raw_payload" JSONB,
    "normalized_at" TIMESTAMP(3),
    "is_duplicate" BOOLEAN NOT NULL DEFAULT false,
    "duplicate_of_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "event_id" TEXT,
    "service_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "fingerprint" TEXT NOT NULL,
    "labels" JSONB NOT NULL DEFAULT '{}',
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "occurrence_count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_groups" (
    "id" TEXT NOT NULL,
    "incident_id" TEXT,
    "correlation_reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_group_members" (
    "alert_group_id" TEXT NOT NULL,
    "alert_id" TEXT NOT NULL,

    CONSTRAINT "alert_group_members_pkey" PRIMARY KEY ("alert_group_id","alert_id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'DETECTED',
    "service_id" TEXT NOT NULL,
    "environment" "Environment" NOT NULL DEFAULT 'production',
    "assigned_to_id" TEXT,
    "ai_triage_confidence" DOUBLE PRECISION,
    "ai_triage_result" JSONB,
    "rca_result" JSONB,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "triaged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "mttd_seconds" INTEGER,
    "mtta_seconds" INTEGER,
    "mttr_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_events" (
    "id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_type" "ActorType" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "evidence_type" "EvidenceType" NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "relevance_score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "collected_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investigations" (
    "id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "model_used" TEXT,
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investigations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rca_results" (
    "id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "probable_cause" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidence_ids" TEXT[],
    "recommended_actions" JSONB NOT NULL DEFAULT '[]',
    "alternative_causes" JSONB NOT NULL DEFAULT '[]',
    "supporting_context" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rca_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remediation_actions" (
    "id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "action_type" "RemediationActionType" NOT NULL,
    "action_params" JSONB NOT NULL DEFAULT '{}',
    "status" "RemediationStatus" NOT NULL DEFAULT 'PROPOSED',
    "risk_score" INTEGER NOT NULL DEFAULT 0,
    "risk_level" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "risk_factors" JSONB NOT NULL DEFAULT '{}',
    "proposed_by_ai" BOOLEAN NOT NULL DEFAULT true,
    "proposed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executed_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "execution_log" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "remediation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL,
    "remediation_action_id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "requested_by_id" TEXT,
    "approved_by_id" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "ai_recommendation" TEXT,
    "risk_summary" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "action_type" "RemediationActionType" NOT NULL,
    "environment" "Environment" NOT NULL DEFAULT 'production',
    "service_tier" "ServiceTier" NOT NULL,
    "max_risk_score" INTEGER NOT NULL DEFAULT 30,
    "requires_approval" BOOLEAN NOT NULL DEFAULT true,
    "is_autonomous" BOOLEAN NOT NULL DEFAULT false,
    "max_retries" INTEGER NOT NULL DEFAULT 1,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runbooks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "service_id" TEXT,
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "version" TEXT NOT NULL DEFAULT '1.0',
    "author_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runbooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postmortems" (
    "id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "business_impact" TEXT NOT NULL,
    "timeline" JSONB NOT NULL DEFAULT '[]',
    "root_cause" TEXT NOT NULL,
    "detection_method" TEXT NOT NULL,
    "remediation_summary" TEXT NOT NULL,
    "verification_summary" TEXT NOT NULL,
    "preventive_actions" JSONB NOT NULL DEFAULT '[]',
    "automation_effectiveness" TEXT NOT NULL,
    "generated_by" TEXT NOT NULL DEFAULT 'AI',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "postmortems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_type" "ActorType" NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "incident_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ai_confidence" DOUBLE PRECISION,
    "risk_score" INTEGER,
    "approval_id" TEXT,
    "remediation_action_id" TEXT,
    "result" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sim_services" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "cpu_percent" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "memory_percent" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "latency_p50_ms" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "latency_p99_ms" DOUBLE PRECISION NOT NULL DEFAULT 150,
    "error_rate_percent" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "throughput_rps" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "db_connections_active" INTEGER NOT NULL DEFAULT 10,
    "db_connections_max" INTEGER NOT NULL DEFAULT 100,
    "queue_depth" INTEGER NOT NULL DEFAULT 0,
    "is_healthy" BOOLEAN NOT NULL DEFAULT true,
    "failure_scenario" "ChaosScenario",
    "failure_started_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sim_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sim_deployments" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "commit_sha" TEXT NOT NULL,
    "deployed_by" TEXT NOT NULL,
    "is_bad_deployment" BOOLEAN NOT NULL DEFAULT false,
    "failure_type" TEXT,
    "deployed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sim_logs" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "trace_id" TEXT,
    "span_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "services_slug_key" ON "services"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "service_dependencies_service_id_depends_on_id_key" ON "service_dependencies"("service_id", "depends_on_id");

-- CreateIndex
CREATE INDEX "events_fingerprint_idx" ON "events"("fingerprint");

-- CreateIndex
CREATE INDEX "events_service_id_idx" ON "events"("service_id");

-- CreateIndex
CREATE INDEX "events_created_at_idx" ON "events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_event_id_key" ON "alerts"("event_id");

-- CreateIndex
CREATE INDEX "alerts_service_id_idx" ON "alerts"("service_id");

-- CreateIndex
CREATE INDEX "alerts_status_idx" ON "alerts"("status");

-- CreateIndex
CREATE INDEX "alerts_fingerprint_idx" ON "alerts"("fingerprint");

-- CreateIndex
CREATE INDEX "incidents_status_idx" ON "incidents"("status");

-- CreateIndex
CREATE INDEX "incidents_service_id_idx" ON "incidents"("service_id");

-- CreateIndex
CREATE INDEX "incidents_severity_idx" ON "incidents"("severity");

-- CreateIndex
CREATE INDEX "incidents_detected_at_idx" ON "incidents"("detected_at");

-- CreateIndex
CREATE INDEX "incident_events_incident_id_idx" ON "incident_events"("incident_id");

-- CreateIndex
CREATE INDEX "evidence_incident_id_idx" ON "evidence"("incident_id");

-- CreateIndex
CREATE INDEX "investigations_incident_id_idx" ON "investigations"("incident_id");

-- CreateIndex
CREATE INDEX "rca_results_incident_id_idx" ON "rca_results"("incident_id");

-- CreateIndex
CREATE INDEX "remediation_actions_incident_id_idx" ON "remediation_actions"("incident_id");

-- CreateIndex
CREATE INDEX "remediation_actions_status_idx" ON "remediation_actions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "approvals_remediation_action_id_key" ON "approvals"("remediation_action_id");

-- CreateIndex
CREATE INDEX "approvals_incident_id_idx" ON "approvals"("incident_id");

-- CreateIndex
CREATE INDEX "approvals_status_idx" ON "approvals"("status");

-- CreateIndex
CREATE INDEX "runbooks_service_id_idx" ON "runbooks"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX "postmortems_incident_id_key" ON "postmortems"("incident_id");

-- CreateIndex
CREATE INDEX "audit_logs_incident_id_idx" ON "audit_logs"("incident_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sim_services_service_id_key" ON "sim_services"("service_id");

-- CreateIndex
CREATE INDEX "sim_deployments_service_id_idx" ON "sim_deployments"("service_id");

-- CreateIndex
CREATE INDEX "sim_deployments_deployed_at_idx" ON "sim_deployments"("deployed_at");

-- CreateIndex
CREATE INDEX "sim_logs_service_id_idx" ON "sim_logs"("service_id");

-- CreateIndex
CREATE INDEX "sim_logs_created_at_idx" ON "sim_logs"("created_at");

-- AddForeignKey
ALTER TABLE "service_dependencies" ADD CONSTRAINT "service_dependencies_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_dependencies" ADD CONSTRAINT "service_dependencies_depends_on_id_fkey" FOREIGN KEY ("depends_on_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_groups" ADD CONSTRAINT "alert_groups_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_group_members" ADD CONSTRAINT "alert_group_members_alert_group_id_fkey" FOREIGN KEY ("alert_group_id") REFERENCES "alert_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_group_members" ADD CONSTRAINT "alert_group_members_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rca_results" ADD CONSTRAINT "rca_results_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remediation_actions" ADD CONSTRAINT "remediation_actions_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_remediation_action_id_fkey" FOREIGN KEY ("remediation_action_id") REFERENCES "remediation_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runbooks" ADD CONSTRAINT "runbooks_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postmortems" ADD CONSTRAINT "postmortems_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_remediation_action_id_fkey" FOREIGN KEY ("remediation_action_id") REFERENCES "remediation_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sim_services" ADD CONSTRAINT "sim_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

