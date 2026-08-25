-- CreateEnum
CREATE TYPE "public"."KnowledgeSourceType" AS ENUM ('RUNBOOK', 'POLICY', 'ARCHITECTURE_DOC', 'INCIDENT_HISTORY', 'GOVERNANCE_POLICY');

-- CreateTable
CREATE TABLE "public"."knowledge_sources" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source_type" "public"."KnowledgeSourceType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_by_subject" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."knowledge_chunks" (
    "id" TEXT NOT NULL,
    "knowledge_source_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_sources_source_type_idx" ON "public"."knowledge_sources"("source_type");
CREATE INDEX "knowledge_sources_is_active_idx" ON "public"."knowledge_sources"("is_active");
CREATE INDEX "knowledge_sources_is_public_idx" ON "public"."knowledge_sources"("is_public");

-- CreateIndex
CREATE INDEX "knowledge_chunks_knowledge_source_id_idx" ON "public"."knowledge_chunks"("knowledge_source_id");

-- AddForeignKey
ALTER TABLE "public"."knowledge_sources" ADD CONSTRAINT "knowledge_sources_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_knowledge_source_id_fkey" FOREIGN KEY ("knowledge_source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
