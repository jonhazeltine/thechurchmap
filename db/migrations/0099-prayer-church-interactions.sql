-- =====================================================================
-- MIGRATION 0099: Prayer Interactions by Church
-- =====================================================================
-- Adds church_id to prayer_interactions table to support tracking
-- interactions for template-based prayers (not stored in database).
-- Template prayers are identified by church_id instead of prayer_id.
-- =====================================================================

-- Add church_id column to prayer_interactions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'prayer_interactions' 
    AND column_name = 'church_id'
  ) THEN
    ALTER TABLE public.prayer_interactions 
    ADD COLUMN church_id uuid REFERENCES public.churches(id) ON DELETE CASCADE;
    
    COMMENT ON COLUMN public.prayer_interactions.church_id IS 
      'Church ID for template-based prayers. Either prayer_id OR church_id should be set.';
  END IF;
END $$;

-- Make prayer_id nullable (template prayers don't have a prayer_id)
ALTER TABLE public.prayer_interactions 
ALTER COLUMN prayer_id DROP NOT NULL;

-- Add constraint: either prayer_id OR church_id must be set
ALTER TABLE public.prayer_interactions 
DROP CONSTRAINT IF EXISTS prayer_interactions_requires_target;

ALTER TABLE public.prayer_interactions 
ADD CONSTRAINT prayer_interactions_requires_target 
CHECK (prayer_id IS NOT NULL OR church_id IS NOT NULL);

-- Create index for church-based interaction queries
CREATE INDEX IF NOT EXISTS idx_prayer_interactions_church_id
  ON public.prayer_interactions(church_id) 
  WHERE church_id IS NOT NULL;

-- Create index for efficient count queries by church
CREATE INDEX IF NOT EXISTS idx_prayer_interactions_church_count
  ON public.prayer_interactions(church_id, created_at DESC)
  WHERE church_id IS NOT NULL;

-- Note: No daily unique constraint - allows multiple interactions per day
-- Throttling is handled in the API (max 5 per minute per user per church)

-- Function to get prayer interaction count for a church (includes both real prayers and template prayers)
CREATE OR REPLACE FUNCTION fn_get_church_prayer_count(p_church_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (
      -- Count interactions on real prayers for this church
      SELECT COUNT(*)::integer
      FROM prayer_interactions pi
      JOIN prayers p ON p.id = pi.prayer_id
      WHERE p.church_id = p_church_id
    ) + (
      -- Count direct church interactions (template prayers)
      SELECT COUNT(*)::integer
      FROM prayer_interactions
      WHERE church_id = p_church_id
    ),
    0
  );
$$;

COMMENT ON FUNCTION fn_get_church_prayer_count IS 
  'Returns total prayer interaction count for a church, including both real prayers and template-based prayers.';
