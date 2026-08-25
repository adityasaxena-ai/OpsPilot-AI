-- CreateEnum
CREATE TYPE "DriftMethod" AS ENUM ('PSI', 'ERROR_RATE_COMPARISON');

-- CreateEnum
CREATE TYPE "DriftState" AS ENUM ('HEALTHY', 'WARNING', 'DRIFT_DETECTED', 'UNDER_REVIEW', 'VALIDATION_REMEDIATION', 'RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "AiIncidentType" AS ENUM ('MODEL_DRIFT', 'HARMFUL_OUTPUT', 'UNEXPECTED_BEHAVIOR', 'RELIABILITY_FAILURE', 'POLICY_VIOLATION', 'GOVERNANCE_CONTROL_FAILURE', 'DATA_ISSUE', 'PERFORMANCE_DEGRADATION', 'HALLUCINATION');

-- CreateEnum
CREATE TYPE "AiIncidentStatus" AS ENUM ('DETECTED', 'TRIAGED', 'UNDER_INVESTIGATION', 'UNDER_REVIEW', 'REMEDIATION_PLANNED', 'REMEDIATION_IN_PROGRESS', 'MONITORING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AiIncidentTimelineEntryType" AS ENUM ('IMPACT', 'EVIDENCE', 'CONTAINMENT', 'INVESTIGATION', 'REMEDIATION', 'APPROVAL', 'CLOSURE');

-- CreateTable
CREATE TABLE "drift_monitors" (
    "id" TEXT NOT NULL,
    "governed_asset_id" TEXT NOT NULL,
    "metric_name" TEXT NOT NULL,
    "method" "DriftMethod" NOT NULL,
    "baseline_snapshot" JSONB NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drift_monitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drift_events" (
    "id" TEXT NOT NULL,
    "drift_monitor_id" TEXT NOT NULL,
    "governed_asset_id" TEXT NOT NULL,
    "state" "DriftState" NOT NULL DEFAULT 'HEALTHY',
    "metric_name" TEXT NOT NULL,
    "baseline_value" JSONB NOT NULL,
    "current_value" JSONB NOT NULL,
    "computed_score" DOUBLE PRECISION NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "detected_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "reviewed_by_subject" TEXT,
    "review_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drift_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_incidents" (
    "id" TEXT NOT NULL,
    "governed_asset_id" TEXT,
    "related_incident_id" TEXT,
    "drift_event_id" TEXT,
    "incident_type" "AiIncidentType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "AiIncidentStatus" NOT NULL DEFAULT 'DETECTED',
    "severity" "Severity" NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_incident_timeline_entries" (
    "id" TEXT NOT NULL,
    "ai_incident_id" TEXT NOT NULL,
    "entry_type" "AiIncidentTimelineEntryType" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "actor_id" TEXT,
    "actor_subject" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_incident_timeline_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drift_monitors_governed_asset_id_idx" ON "drift_monitors"("governed_asset_id");

-- CreateIndex
CREATE INDEX "drift_events_drift_monitor_id_idx" ON "drift_events"("drift_monitor_id");
CREATE INDEX "drift_events_governed_asset_id_idx" ON "drift_events"("governed_asset_id");

-- CreateIndex
CREATE INDEX "ai_incidents_governed_asset_id_idx" ON "ai_incidents"("governed_asset_id");
CREATE INDEX "ai_incidents_related_incident_id_idx" ON "ai_incidents"("related_incident_id");
CREATE INDEX "ai_incidents_drift_event_id_idx" ON "ai_incidents"("drift_event_id");

-- CreateIndex
CREATE INDEX "ai_incident_timeline_entries_ai_incident_id_idx" ON "ai_incident_timeline_entries"("ai_incident_id");

-- AddForeignKey
ALTER TABLE "drift_monitors" ADD CONSTRAINT "drift_monitors_governed_asset_id_fkey" FOREIGN KEY ("governed_asset_id") REFERENCES "governed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_events" ADD CONSTRAINT "drift_events_drift_monitor_id_fkey" FOREIGN KEY ("drift_monitor_id") REFERENCES "drift_monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drift_events" ADD CONSTRAINT "drift_events_governed_asset_id_fkey" FOREIGN KEY ("governed_asset_id") REFERENCES "governed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drift_events" ADD CONSTRAINT "drift_events_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_incidents" ADD CONSTRAINT "ai_incidents_governed_asset_id_fkey" FOREIGN KEY ("governed_asset_id") REFERENCES "governed_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_incidents" ADD CONSTRAINT "ai_incidents_related_incident_id_fkey" FOREIGN KEY ("related_incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_incidents" ADD CONSTRAINT "ai_incidents_drift_event_id_fkey" FOREIGN KEY ("drift_event_id") REFERENCES "drift_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_incident_timeline_entries" ADD CONSTRAINT "ai_incident_timeline_entries_ai_incident_id_fkey" FOREIGN KEY ("ai_incident_id") REFERENCES "ai_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_incident_timeline_entries" ADD CONSTRAINT "actor_id" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
