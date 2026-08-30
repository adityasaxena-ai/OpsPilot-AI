/*
  Warnings:

  - A unique constraint covering the columns `[username]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `username` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'SRE_OPERATOR';
ALTER TYPE "UserRole" ADD VALUE 'SECURITY_ADMIN';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_hash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "username" TEXT,
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "name" DROP NOT NULL;

-- Populate username for any pre-existing rows before setting NOT NULL
UPDATE "users" SET "username" = COALESCE(NULLIF("email", ''), CONCAT('user_', "id")) WHERE "username" IS NULL;

-- Enforce NOT NULL on username
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;


-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- RenameForeignKey safely
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'actor_id'
  ) THEN
    ALTER TABLE "ai_incident_timeline_entries" RENAME CONSTRAINT "actor_id" TO "ai_incident_timeline_entries_actor_id_fkey";
  END IF;
END $$;

