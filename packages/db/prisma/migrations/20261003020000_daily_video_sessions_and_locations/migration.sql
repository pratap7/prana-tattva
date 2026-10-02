-- AlterEnum
ALTER TYPE "ConsentType" ADD VALUE 'SESSION_RECORDING';

-- AlterTable
ALTER TABLE "services"
ADD COLUMN "locationAddress" TEXT,
ADD COLUMN "locationCity" TEXT,
ADD COLUMN "locationCoordinates" JSONB,
ADD COLUMN "locationInstructions" TEXT;

-- AlterTable
ALTER TABLE "sessions"
ADD COLUMN "videoRoomUrl" TEXT,
ADD COLUMN "extendedMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "recordingStatus" TEXT NOT NULL DEFAULT 'DISABLED',
ADD COLUMN "recordingConsents" JSONB,
ADD COLUMN "metadata" JSONB;
