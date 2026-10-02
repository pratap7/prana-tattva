-- Migration: Add PostgreSQL GiST exclusion constraint for provider bookings
-- Requirement: Prevent overlapping CONFIRMED / PENDING_PAYMENT bookings for the same provider at the database level.

-- 1. Ensure the btree_gist extension is available
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Add the EXCLUDE constraint
-- When a booking with status CONFIRMED or PENDING_PAYMENT is inserted or updated,
-- PostgreSQL checks that no other booking for the same provider_id has an overlapping time range [start_at, end_at).
ALTER TABLE "bookings"
DROP CONSTRAINT IF EXISTS "no_overlapping_provider_bookings";

ALTER TABLE "bookings"
ADD CONSTRAINT "no_overlapping_provider_bookings"
EXCLUDE USING gist (
  provider_id WITH =,
  tstzrange(start_at, end_at) WITH &&
)
WHERE (status IN ('CONFIRMED', 'PENDING_PAYMENT'));
