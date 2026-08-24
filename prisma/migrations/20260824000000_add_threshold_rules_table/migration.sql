-- CreateTable
CREATE TABLE "threshold_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "duration_sec" INTEGER NOT NULL DEFAULT 0,
    "severity" "Severity" NOT NULL DEFAULT 'P2',
    "service_id" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "threshold_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "threshold_rules_service_id_idx" ON "threshold_rules"("service_id");

-- AddForeignKey
ALTER TABLE "threshold_rules" ADD CONSTRAINT "threshold_rules_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
