-- CreateEnum
CREATE TYPE "public"."PredictionMethod" AS ENUM ('TREND_SLOPE');

-- CreateEnum
CREATE TYPE "public"."PredictionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'INSUFFICIENT_EVIDENCE');

-- CreateTable
CREATE TABLE "public"."prediction_monitors" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "metric_name" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "horizon_minutes" INTEGER NOT NULL,
    "minimum_samples" INTEGER NOT NULL DEFAULT 5,
    "method" "public"."PredictionMethod" NOT NULL DEFAULT 'TREND_SLOPE',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prediction_monitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."predictions" (
    "id" TEXT NOT NULL,
    "prediction_monitor_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "metric_name" TEXT NOT NULL,
    "status" "public"."PredictionStatus" NOT NULL,
    "projected_value" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION NOT NULL,
    "horizon_minutes" INTEGER NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "evidence_samples" JSONB NOT NULL,
    "trend_slope" DOUBLE PRECISION,
    "explanation" TEXT NOT NULL,
    "predicted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "reviewed_by_id" TEXT,
    "reviewed_by_subject" TEXT,
    "review_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "predictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prediction_monitors_service_id_idx" ON "public"."prediction_monitors"("service_id");

-- CreateIndex
CREATE INDEX "predictions_prediction_monitor_id_idx" ON "public"."predictions"("prediction_monitor_id");

-- CreateIndex
CREATE INDEX "predictions_service_id_idx" ON "public"."predictions"("service_id");

-- CreateIndex
CREATE INDEX "predictions_status_idx" ON "public"."predictions"("status");

-- AddForeignKey
ALTER TABLE "public"."prediction_monitors" ADD CONSTRAINT "prediction_monitors_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."predictions" ADD CONSTRAINT "predictions_prediction_monitor_id_fkey" FOREIGN KEY ("prediction_monitor_id") REFERENCES "public"."prediction_monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."predictions" ADD CONSTRAINT "predictions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
