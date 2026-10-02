-- AlterTable conversations
ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_consumerId_providerId_bookingId_key";
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "isUnlocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "preBookingMessageCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_consumerId_providerId_key" ON "conversations"("consumerId", "providerId");
CREATE INDEX IF NOT EXISTS "conversations_lastMessageAt_idx" ON "conversations"("lastMessageAt");

-- AlterTable messages
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "keyVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "attachmentType" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "attachmentSize" INTEGER;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "hasLeakageWarning" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "leakageFlags" JSONB;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "flaggedForModeration" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "moderationReason" TEXT;
CREATE INDEX IF NOT EXISTS "messages_flaggedForModeration_idx" ON "messages"("flaggedForModeration");

-- CreateTable user_blocks
CREATE TABLE IF NOT EXISTS "user_blocks" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_blocks_blockerId_blockedId_key" ON "user_blocks"("blockerId", "blockedId");
CREATE INDEX IF NOT EXISTS "user_blocks_blockerId_idx" ON "user_blocks"("blockerId");
CREATE INDEX IF NOT EXISTS "user_blocks_blockedId_idx" ON "user_blocks"("blockedId");
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable notification_preferences
CREATE TABLE IF NOT EXISTS "notification_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT true,
    "sms" BOOLEAN NOT NULL DEFAULT false,
    "push" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "notification_preferences_userId_type_key" ON "notification_preferences"("userId", "type");
CREATE INDEX IF NOT EXISTS "notification_preferences_userId_idx" ON "notification_preferences"("userId");
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable notification_delivery_logs
CREATE TABLE IF NOT EXISTS "notification_delivery_logs" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "error" TEXT,
    "payload" JSONB,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_delivery_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "notification_delivery_logs_userId_createdAt_idx" ON "notification_delivery_logs"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "notification_delivery_logs_status_createdAt_idx" ON "notification_delivery_logs"("status", "createdAt");

-- CreateTable push_subscriptions
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX IF NOT EXISTS "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable scheduled_reminders
CREATE TABLE IF NOT EXISTS "scheduled_reminders" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "triggerAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_reminders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_reminders_jobId_key" ON "scheduled_reminders"("jobId");
CREATE INDEX IF NOT EXISTS "scheduled_reminders_bookingId_idx" ON "scheduled_reminders"("bookingId");
CREATE INDEX IF NOT EXISTS "scheduled_reminders_status_triggerAt_idx" ON "scheduled_reminders"("status", "triggerAt");
ALTER TABLE "scheduled_reminders" ADD CONSTRAINT "scheduled_reminders_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
