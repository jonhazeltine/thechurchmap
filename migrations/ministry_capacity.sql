-- Migration: Phase 2 - Ministry capacity and area-tract overlap tables
-- Target: Local PostgreSQL (NOT Supabase)

-- 1. church_ministry_capacity (mirrors church_prayer_budgets pattern)
CREATE TABLE IF NOT EXISTS church_ministry_capacity (
  church_id UUID PRIMARY KEY,
  community_ministry_volunteers INTEGER NOT NULL DEFAULT 0,
  annual_ministry_budget INTEGER NOT NULL DEFAULT 0,
  effective_pop INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE church_ministry_capacity ADD COLUMN IF NOT EXISTS effective_pop INTEGER NOT NULL DEFAULT 0;

-- 2. ministry_area_tract_overlaps (derived/cached spatial overlap data)
-- Note: area_id is VARCHAR (not UUID) to support primary-{churchId} composite IDs
CREATE TABLE IF NOT EXISTS ministry_area_tract_overlaps (
  area_id VARCHAR NOT NULL,
  tract_geoid VARCHAR NOT NULL,
  church_id UUID,
  overlap_fraction DOUBLE PRECISION NOT NULL DEFAULT 0,
  population_covered INTEGER NOT NULL DEFAULT 0,
  computed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (area_id, tract_geoid)
);

CREATE INDEX IF NOT EXISTS idx_ministry_area_tract_overlaps_area_id
  ON ministry_area_tract_overlaps (area_id);

CREATE INDEX IF NOT EXISTS idx_ministry_area_tract_overlaps_tract_geoid
  ON ministry_area_tract_overlaps (tract_geoid);

CREATE INDEX IF NOT EXISTS idx_ministry_overlaps_church
  ON ministry_area_tract_overlaps (church_id);

-- 3. church_ministry_allocations (per-area emphasis sliders, Phase 3 prep)
CREATE TABLE IF NOT EXISTS church_ministry_allocations (
  church_id UUID NOT NULL,
  area_id UUID NOT NULL,
  allocation_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (church_id, area_id)
);
