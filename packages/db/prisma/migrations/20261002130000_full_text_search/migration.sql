-- Migration: Full-text search and trigram indexes for Provider Discovery
-- Requirement: Weighted full-text search (displayName > headline > specialties > bio) with GIN index,
-- plus trigram indexes for typo tolerance.

-- 1. Enable PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Add columns if not already present
ALTER TABLE "provider_profiles"
ADD COLUMN IF NOT EXISTS "completed_sessions" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "provider_profiles"
ADD COLUMN IF NOT EXISTS "response_rate" INTEGER NOT NULL DEFAULT 100;

ALTER TABLE "provider_profiles"
ADD COLUMN IF NOT EXISTS "search_vector" tsvector;

-- 3. Function to compute weighted search vector for a provider
-- Weights:
-- A: displayName
-- B: headline
-- C: categories / specialties
-- D: bio
CREATE OR REPLACE FUNCTION generate_provider_search_vector(
  p_display_name TEXT,
  p_headline TEXT,
  p_categories TEXT,
  p_bio TEXT
) RETURNS tsvector AS $$
BEGIN
  RETURN (
    setweight(to_tsvector('english', unaccent(coalesce(p_display_name, ''))), 'A') ||
    setweight(to_tsvector('english', unaccent(coalesce(p_headline, ''))), 'B') ||
    setweight(to_tsvector('english', unaccent(coalesce(p_categories, ''))), 'C') ||
    setweight(to_tsvector('english', unaccent(coalesce(p_bio, ''))), 'D')
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. Trigger function to automatically maintain search_vector on provider_profiles insert or update
CREATE OR REPLACE FUNCTION trg_provider_search_vector_update() RETURNS trigger AS $$
DECLARE
  v_categories TEXT;
BEGIN
  -- Gather associated categories for this provider
  SELECT string_agg(c.name, ' ')
  INTO v_categories
  FROM provider_categories pc
  JOIN categories c ON c.id = pc.category_id
  WHERE pc.provider_id = NEW.id;

  NEW.search_vector := generate_provider_search_vector(
    NEW.display_name,
    NEW.headline,
    v_categories,
    NEW.bio
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_provider_profiles_search_vector ON provider_profiles;

CREATE TRIGGER trg_provider_profiles_search_vector
BEFORE INSERT OR UPDATE OF display_name, headline, bio ON provider_profiles
FOR EACH ROW
EXECUTE FUNCTION trg_provider_search_vector_update();

-- 5. GIN indexes for fast full-text search and trigram fuzzy matching
CREATE INDEX IF NOT EXISTS "idx_provider_profiles_search_vector"
ON "provider_profiles" USING gin ("search_vector");

CREATE INDEX IF NOT EXISTS "idx_provider_profiles_trgm_name"
ON "provider_profiles" USING gin ("display_name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "idx_provider_profiles_trgm_headline"
ON "provider_profiles" USING gin ("headline" gin_trgm_ops);

-- Additional composite indexes for fast filter combinations
CREATE INDEX IF NOT EXISTS "idx_provider_profiles_approval_tier"
ON "provider_profiles" ("approval_status", "verification_tier");

CREATE INDEX IF NOT EXISTS "idx_provider_profiles_city_approval"
ON "provider_profiles" ("city", "approval_status");
