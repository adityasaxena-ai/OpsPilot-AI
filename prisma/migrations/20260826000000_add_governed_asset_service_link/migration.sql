-- AlterTable
ALTER TABLE "governed_assets" ADD COLUMN "service_id" TEXT;

-- CreateIndex
CREATE INDEX "governed_assets_service_id_idx" ON "governed_assets"("service_id");

-- AddForeignKey
ALTER TABLE "governed_assets" ADD CONSTRAINT "governed_assets_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
