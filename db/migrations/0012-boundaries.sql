-- Create boundaries table for large-scale boundary datasets
-- This is separate from 'areas' to handle massive imports (cities, counties, ZIPs, neighborhoods)
-- These boundaries are NOT rendered in the UI by default - they're for search/lookup only

CREATE TABLE IF NOT EXISTS public.boundaries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id text, -- e.g., FIPS code, census ID, etc
  name text NOT NULL,
  type text NOT NULL CHECK (
    type IN ('county','city','zip','neighborhood','school_district','other')
  ),
  geometry geography(Polygon, 4326) NOT NULL,
  source text NOT NULL, -- TIGER, GR Open Data, NCES, etc.
  created_at timestamptz NOT NULL DEFAULT now()
);

-- GIST index for fast spatial queries
CREATE INDEX IF NOT EXISTS idx_boundaries_geometry
  ON public.boundaries USING GIST ((geometry));

-- GIN index with trigram for fuzzy text search on name
CREATE INDEX IF NOT EXISTS idx_boundaries_name_trgm
  ON public.boundaries USING GIN (name gin_trgm_ops);

-- Index on type for filtering
CREATE INDEX IF NOT EXISTS idx_boundaries_type
  ON public.boundaries (type);

-- Composite index for common queries (type + name)
CREATE INDEX IF NOT EXISTS idx_boundaries_type_name
  ON public.boundaries (type, name);
