-- =====================================================================
-- MIGRATION 0044: Prayer Mode V2 - Regional/Global Prayer Support
-- =====================================================================
-- This migration extends the prayers table to support regional and global
-- prayers in addition to church-specific prayers, enabling a zoom-aware
-- prayer mode experience.
-- =====================================================================

-- Add nullable columns to prayers table for regional/global support
DO $$
BEGIN
  -- Add region_type (e.g., 'city', 'county', 'zip')
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'prayers' 
    AND column_name = 'region_type'
  ) THEN
    ALTER TABLE public.prayers 
    ADD COLUMN region_type text NULL;
  END IF;

  -- Add region_id (external ID reference like FIPS code)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'prayers' 
    AND column_name = 'region_id'
  ) THEN
    ALTER TABLE public.prayers 
    ADD COLUMN region_id text NULL;
  END IF;

  -- Add area_id (reference to custom areas table)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'prayers' 
    AND column_name = 'area_id'
  ) THEN
    ALTER TABLE public.prayers 
    ADD COLUMN area_id uuid NULL REFERENCES public.areas(id) ON DELETE SET NULL;
  END IF;

  -- Add global flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'prayers' 
    AND column_name = 'global'
  ) THEN
    ALTER TABLE public.prayers 
    ADD COLUMN global boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add comments
COMMENT ON COLUMN public.prayers.region_type IS 'Type of region (city, county, zip) - nullable for church prayers';
COMMENT ON COLUMN public.prayers.region_id IS 'External ID for region (e.g., FIPS code) - nullable for church prayers';
COMMENT ON COLUMN public.prayers.area_id IS 'Reference to custom area - nullable for church/regional/global prayers';
COMMENT ON COLUMN public.prayers.global IS 'Whether this prayer is shown globally regardless of zoom/location';

-- Create indexes for regional/global prayer queries
CREATE INDEX IF NOT EXISTS idx_prayers_global
  ON public.prayers(global) WHERE global = true;

CREATE INDEX IF NOT EXISTS idx_prayers_region
  ON public.prayers(region_type, region_id) WHERE region_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prayers_area
  ON public.prayers(area_id) WHERE area_id IS NOT NULL;

-- Create index for efficient approved prayers queries
CREATE INDEX IF NOT EXISTS idx_prayers_approved
  ON public.prayers(status) WHERE status = 'approved';

-- Update prayer_interactions index for recent queries
CREATE INDEX IF NOT EXISTS idx_prayer_interactions_recent
  ON public.prayer_interactions(created_at DESC);

-- Note: prayer_interactions table already exists from migration 0030
-- The existing table structure is:
--   - id uuid PRIMARY KEY
--   - prayer_id uuid REFERENCES prayers(id) ON DELETE CASCADE
--   - user_id uuid REFERENCES profiles(id) ON DELETE SET NULL
--   - interaction_type text CHECK (interaction_type IN ('prayed'))
--   - created_at timestamptz
--   - UNIQUE (prayer_id, user_id, interaction_type)
-- This structure is already perfect for Prayer Mode V2 needs.
