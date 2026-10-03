-- CreateEnum
CREATE TYPE "AdminPermission" AS ENUM ('SUPPORT', 'FINANCE', 'TRUST_SAFETY', 'SUPER_ADMIN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "adminPermissions" "AdminPermission"[] DEFAULT ARRAY[]::"AdminPermission"[];

-- AlterTable
ALTER TABLE "provider_profiles" ADD COLUMN IF NOT EXISTS "isFeatured" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "reason" TEXT,
ADD COLUMN IF NOT EXISTS "beforeState" JSONB,
ADD COLUMN IF NOT EXISTS "afterState" JSONB;

-- CreateTable
CREATE TABLE IF NOT EXISTS "platform_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);
