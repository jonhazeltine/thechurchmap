-- Migration: Add tract-scoped prayer fields to prayers table
-- Run this in the Supabase SQL Editor or via the admin migration endpoint

ALTER TABLE prayers ADD COLUMN IF NOT EXISTS scope_type text DEFAULT NULL;
ALTER TABLE prayers ADD COLUMN IF NOT EXISTS tract_id text DEFAULT NULL;
ALTER TABLE prayers ADD COLUMN IF NOT EXISTS click_lat double precision DEFAULT NULL;
ALTER TABLE prayers ADD COLUMN IF NOT EXISTS click_lng double precision DEFAULT NULL;

-- Index for efficient tract-scoped prayer lookups
CREATE INDEX IF NOT EXISTS idx_prayers_scope_type ON prayers (scope_type) WHERE scope_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prayers_tract_id ON prayers (tract_id) WHERE tract_id IS NOT NULL;
