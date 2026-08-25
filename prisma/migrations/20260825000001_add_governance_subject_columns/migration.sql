-- AlterTable
ALTER TABLE "governance_risk_assessments" ADD COLUMN "assessed_by_subject" TEXT;

-- AlterTable
ALTER TABLE "governance_approvals" ADD COLUMN "requested_by_subject" TEXT,
ADD COLUMN "approved_by_subject" TEXT;
