-- Migration 0034: Add Primary Ministry Areas and Calling-Specific Boundaries
-- This migration implements the architectural change where:
-- 1. Every church can define a primary ministry area (custom drawn polygon)
-- 2. Each calling can have its own custom boundary (defaults to primary ministry area)

-- Add primary_ministry_area to churches table
ALTER TABLE public.churches
ADD COLUMN IF NOT EXISTS primary_ministry_area geography(Polygon, 4326);

-- Add calling_id to areas table to link ministry areas to specific callings
ALTER TABLE public.areas
ADD COLUMN IF NOT EXISTS calling_id uuid REFERENCES public.callings(id) ON DELETE CASCADE;

-- Create index for faster filtering by calling
CREATE INDEX IF NOT EXISTS idx_areas_calling_id
  ON public.areas(calling_id);

-- Add index for primary ministry area spatial queries
CREATE INDEX IF NOT EXISTS idx_churches_primary_ministry_area
  ON public.churches USING GIST ((primary_ministry_area));

COMMENT ON COLUMN public.churches.primary_ministry_area IS 'Custom-drawn polygon representing the churchs primary ministry area. This is an intentional commitment that churches must define.';
COMMENT ON COLUMN public.areas.calling_id IS 'Links a ministry area to a specific calling. If null, this is a general ministry area. If set, this represents a calling-specific boundary override.';
