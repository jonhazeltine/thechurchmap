-- Make church_id nullable in prayers table to support global and regional prayers
-- Global and regional prayers are not tied to a specific church

ALTER TABLE public.prayers 
  ALTER COLUMN church_id DROP NOT NULL;

-- Add a check constraint to ensure data integrity:
-- Either church_id is set (church prayer) OR global/region_type is set (global/regional prayer)
ALTER TABLE public.prayers
  ADD CONSTRAINT prayers_scope_check 
  CHECK (
    (church_id IS NOT NULL AND global = false AND region_type IS NULL)
    OR
    (church_id IS NULL AND (global = true OR region_type IS NOT NULL))
  );

-- Update indexes to handle nullable church_id
DROP INDEX IF EXISTS idx_prayers_church_id;
DROP INDEX IF EXISTS idx_prayers_church_status;
DROP INDEX IF EXISTS idx_prayers_church_created;

-- Recreate indexes with WHERE clause to handle nulls efficiently
CREATE INDEX idx_prayers_church_id ON public.prayers(church_id) WHERE church_id IS NOT NULL;
CREATE INDEX idx_prayers_church_status ON public.prayers(church_id, status) WHERE church_id IS NOT NULL;
CREATE INDEX idx_prayers_church_created ON public.prayers(church_id, created_at DESC) WHERE church_id IS NOT NULL;

-- Add indexes for global/regional prayers
CREATE INDEX idx_prayers_global ON public.prayers(global, status) WHERE global = true;
CREATE INDEX idx_prayers_regional ON public.prayers(region_type, region_id, status) WHERE region_type IS NOT NULL;
