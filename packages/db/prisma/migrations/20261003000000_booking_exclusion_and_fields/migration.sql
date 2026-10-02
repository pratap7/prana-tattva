-- CreateExtension
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- AlterTable
ALTER TABLE "provider_profiles" ADD COLUMN IF NOT EXISTS "reliability_strikes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refund_amount" INTEGER;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "refund_reason" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "rescheduled_count" INTEGER NOT NULL DEFAULT 0;

-- Drop constraint if exists
ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "no_overlapping_provider_bookings";

-- Create exclusion constraint to guarantee no two active bookings overlap for the same provider
ALTER TABLE "bookings"
ADD CONSTRAINT "no_overlapping_provider_bookings"
EXCLUDE USING gist (
  provider_id WITH =,
  tstzrange(start_at, end_at, '[)') WITH &&
)
WHERE (status IN ('PENDING_PAYMENT', 'CONFIRMED'));
