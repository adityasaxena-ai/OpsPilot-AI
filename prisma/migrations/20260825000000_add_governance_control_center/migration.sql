-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('MODEL', 'AGENT', 'PROMPT', 'KNOWLEDGE_SOURCE');

-- CreateEnum
CREATE TYPE "LifecycleStage" AS ENUM ('PROPOSED', 'EVALUATED', 'APPROVED', 'LIVE', 'UNDER_REVIEW', 'RETIRED');

-- CreateTable
CREATE TABLE "governed_assets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "asset_type" "AssetType" NOT NULL,
    "description" TEXT NOT NULL,
    "owner_team" TEXT NOT NULL,
    "owner_email" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "lifecycle_stage" "LifecycleStage" NOT NULL DEFAULT 'PROPOSED',
    "risk_level" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance_risk_assessments" (
    "id" TEXT NOT NULL,
    "governed_asset_id" TEXT NOT NULL,
    "fairness_notes" TEXT,
    "transparency_notes" TEXT,
    "privacy_notes" TEXT,
    "accountability_notes" TEXT,
    "reliability_notes" TEXT,
    "security_notes" TEXT,
    "risk_score" INTEGER NOT NULL,
    "risk_level" "RiskLevel" NOT NULL,
    "assessed_by_id" TEXT,
    "assessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "governance_risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "applies_to" "AssetType" NOT NULL,
    "requires_approval_for" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "governance_approvals" (
    "id" TEXT NOT NULL,
    "governed_asset_id" TEXT NOT NULL,
    "target_stage" "LifecycleStage" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by_id" TEXT,
    "approved_by_id" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "governance_risk_assessments_governed_asset_id_idx" ON "governance_risk_assessments"("governed_asset_id");

-- CreateIndex
CREATE INDEX "governance_approvals_governed_asset_id_idx" ON "governance_approvals"("governed_asset_id");

-- AddForeignKey
ALTER TABLE "governance_risk_assessments" ADD CONSTRAINT "governance_risk_assessments_governed_asset_id_fkey" FOREIGN KEY ("governed_asset_id") REFERENCES "governed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_risk_assessments" ADD CONSTRAINT "governance_risk_assessments_assessed_by_id_fkey" FOREIGN KEY ("assessed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_approvals" ADD CONSTRAINT "governance_approvals_governed_asset_id_fkey" FOREIGN KEY ("governed_asset_id") REFERENCES "governed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_approvals" ADD CONSTRAINT "governance_approvals_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_approvals" ADD CONSTRAINT "governance_approvals_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
