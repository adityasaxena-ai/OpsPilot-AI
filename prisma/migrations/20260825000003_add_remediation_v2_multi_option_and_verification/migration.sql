-- AlterEnum
ALTER TYPE "RemediationStatus" ADD VALUE 'SUPERSEDED';

-- CreateEnum
CREATE TYPE "VerificationVerdict" AS ENUM ('VERIFIED_SUCCESS', 'INCONCLUSIVE', 'VERIFIED_FAILURE');

-- AlterTable
ALTER TABLE "remediation_actions"
  ADD COLUMN "remediation_option_set_id" TEXT,
  ADD COLUMN "success_criteria" JSONB,
  ADD COLUMN "verification_verdict" "VerificationVerdict",
  ADD COLUMN "verified_at" TIMESTAMP(3),
  ADD COLUMN "verification_notes" TEXT;

-- CreateTable
CREATE TABLE "remediation_baselines" (
    "id" TEXT NOT NULL,
    "remediation_action_id" TEXT NOT NULL,
    "captured_metrics" JSONB NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "remediation_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "remediation_baselines_remediation_action_id_key" ON "remediation_baselines"("remediation_action_id");

-- CreateIndex
CREATE INDEX "remediation_actions_remediation_option_set_id_idx" ON "remediation_actions"("remediation_option_set_id");

-- AddForeignKey
ALTER TABLE "remediation_baselines" ADD CONSTRAINT "remediation_baselines_remediation_action_id_fkey" FOREIGN KEY ("remediation_action_id") REFERENCES "remediation_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
