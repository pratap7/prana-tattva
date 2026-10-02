-- AlterTable
ALTER TABLE "payments" ADD COLUMN "taxBreakdown" JSONB;
ALTER TABLE "payments" ADD COLUMN "metadata" JSONB;

-- CreateTable
CREATE TABLE "processed_webhook_events" (
    "id" TEXT NOT NULL,
    "gateway" "PaymentGateway" NOT NULL DEFAULT 'RAZORPAY',
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processed_webhook_events_eventId_key" ON "processed_webhook_events"("eventId");

-- CreateIndex
CREATE INDEX "processed_webhook_events_gateway_eventId_idx" ON "processed_webhook_events"("gateway", "eventId");
