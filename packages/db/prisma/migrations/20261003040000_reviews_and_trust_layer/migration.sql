-- CreateEnum
CREATE TYPE "ReviewModerationStatus" AS ENUM ('PUBLISHED', 'PENDING_MODERATION', 'FLAGGED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterTable provider_profiles
ALTER TABLE "provider_profiles"
ADD COLUMN "bayesianRating" DECIMAL(3, 2) NOT NULL DEFAULT 0.0,
ADD COLUMN "completionRate" DECIMAL(5, 2) NOT NULL DEFAULT 100.0,
ADD COLUMN "cancellationRate" DECIMAL(5, 2) NOT NULL DEFAULT 0.0,
ADD COLUMN "avgResponseMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "reliabilityBadges" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "provider_profiles_bayesianRating_idx" ON "provider_profiles"("bayesianRating" DESC);

-- AlterTable reviews
ALTER TABLE "reviews"
ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "providerRepliedAt" TIMESTAMP(3),
ADD COLUMN "moderationStatus" "ReviewModerationStatus" NOT NULL DEFAULT 'PUBLISHED',
ADD COLUMN "isFlagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "flagReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "clientIp" TEXT,
ADD COLUMN "deviceHash" TEXT,
ADD COLUMN "editedAt" TIMESTAMP(3),
ADD COLUMN "replyEditedAt" TIMESTAMP(3);

CREATE INDEX "reviews_moderationStatus_idx" ON "reviews"("moderationStatus");

-- CreateTable review_reports
CREATE TABLE "review_reports" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "review_reports_reviewId_status_idx" ON "review_reports"("reviewId", "status");
CREATE INDEX "review_reports_reporterId_idx" ON "review_reports"("reporterId");

ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable reports
ALTER TABLE "reports"
ADD COLUMN "severity" "ReportSeverity" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN "autoSuspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "adminNotes" TEXT,
ADD COLUMN "actionTaken" TEXT;
