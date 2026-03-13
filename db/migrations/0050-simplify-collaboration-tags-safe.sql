-- =====================================================================
-- SIMPLIFY COLLABORATION TAXONOMY: SINGLE MASTER TAG LIST (SAFE VERSION)
-- =====================================================================
-- Migration 0050 (Safe): Remove categories and consolidate duplicate tags
--                        into a single master list
-- Created: 2025-11-24
--
-- This migration:
-- - Safely checks if category_key column exists before using it
-- - Preserves existing UUIDs from collaboration_have tags (if they exist)
-- - Deletes duplicate collaboration_need tags (if they exist)
-- - Removes category_key column from collaboration_tags (if it exists)
-- - Drops the collaboration_categories table (if it exists)
-- - Recreates RPC helper functions for the new simplified schema
-- =====================================================================

DO $$
BEGIN
  -- =====================================================================
  -- STEP 1: DELETE DUPLICATE TAGS (if category_key column exists)
  -- =====================================================================
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'collaboration_tags' 
    AND column_name = 'category_key'
  ) THEN
    RAISE NOTICE 'Deleting duplicate collaboration_need tags...';
    DELETE FROM collaboration_tags
    WHERE category_key = 'collaboration_need';
    RAISE NOTICE 'Duplicate tags deleted.';
  ELSE
    RAISE NOTICE 'category_key column does not exist, skipping deletion step.';
  END IF;
END $$;

-- =====================================================================
-- STEP 2: DROP OLD UNIQUE CONSTRAINT (if it exists)
-- =====================================================================
ALTER TABLE collaboration_tags
DROP CONSTRAINT IF EXISTS collaboration_tags_category_key_slug_key;

-- =====================================================================
-- STEP 3: REMOVE CATEGORY_KEY COLUMN (if it exists)
-- =====================================================================
ALTER TABLE collaboration_tags
DROP COLUMN IF EXISTS category_key;

-- =====================================================================
-- STEP 4: ADD NEW UNIQUE CONSTRAINT ON SLUG ONLY (if not exists)
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'collaboration_tags_slug_key'
  ) THEN
    ALTER TABLE collaboration_tags
    ADD CONSTRAINT collaboration_tags_slug_key UNIQUE (slug);
    RAISE NOTICE 'Added unique constraint on slug.';
  ELSE
    RAISE NOTICE 'Unique constraint on slug already exists.';
  END IF;
END $$;

-- =====================================================================
-- STEP 5: DROP CATEGORIES TABLE (if it exists)
-- =====================================================================
DROP TABLE IF EXISTS collaboration_categories CASCADE;

-- =====================================================================
-- STEP 6: RECREATE RPC HELPER FUNCTIONS
-- =====================================================================
-- These may have been CASCADE dropped when we dropped collaboration_categories
-- We need to recreate them for the simplified schema (no categories)

-- Get all collaboration tags
CREATE OR REPLACE FUNCTION get_collaboration_tags()
RETURNS SETOF collaboration_tags
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM collaboration_tags ORDER BY sort_order ASC;
$$;

-- Get collaboration tag by id
CREATE OR REPLACE FUNCTION get_collaboration_tag_by_id(id_param uuid)
RETURNS SETOF collaboration_tags
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM collaboration_tags WHERE id = id_param;
$$;

-- Insert collaboration tag
CREATE OR REPLACE FUNCTION insert_collaboration_tag(
  slug_param text,
  label_param text,
  description_param text DEFAULT NULL,
  is_active_param boolean DEFAULT true,
  sort_order_param integer DEFAULT 0
)
RETURNS SETOF collaboration_tags
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO collaboration_tags (slug, label, description, is_active, sort_order)
  VALUES (slug_param, label_param, description_param, is_active_param, sort_order_param)
  RETURNING *;
$$;

-- Update collaboration tag
CREATE OR REPLACE FUNCTION update_collaboration_tag(
  id_param uuid,
  slug_param text DEFAULT NULL,
  label_param text DEFAULT NULL,
  description_param text DEFAULT NULL,
  is_active_param boolean DEFAULT NULL,
  sort_order_param integer DEFAULT NULL
)
RETURNS SETOF collaboration_tags
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE collaboration_tags
  SET
    slug = COALESCE(slug_param, slug),
    label = COALESCE(label_param, label),
    description = COALESCE(description_param, description),
    is_active = COALESCE(is_active_param, is_active),
    sort_order = COALESCE(sort_order_param, sort_order)
  WHERE id = id_param
  RETURNING *;
END;
$$;

-- Deactivate collaboration tag (soft delete)
CREATE OR REPLACE FUNCTION deactivate_collaboration_tag(id_param uuid)
RETURNS SETOF collaboration_tags
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE collaboration_tags
  SET is_active = false
  WHERE id = id_param
  RETURNING *;
$$;

-- Check if tag slug exists
CREATE OR REPLACE FUNCTION tag_slug_exists(slug_param text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS(SELECT 1 FROM collaboration_tags WHERE slug = slug_param);
$$;

-- Add comments to functions
COMMENT ON FUNCTION get_collaboration_tags() IS 'Get all collaboration tags ordered by sort_order';
COMMENT ON FUNCTION get_collaboration_tag_by_id(uuid) IS 'Get a specific collaboration tag by id';
COMMENT ON FUNCTION insert_collaboration_tag(text, text, text, boolean, integer) IS 'Insert a new collaboration tag';
COMMENT ON FUNCTION update_collaboration_tag(uuid, text, text, text, boolean, integer) IS 'Update an existing collaboration tag';
COMMENT ON FUNCTION deactivate_collaboration_tag(uuid) IS 'Deactivate (soft delete) a collaboration tag';
COMMENT ON FUNCTION tag_slug_exists(text) IS 'Check if a tag slug exists';

-- =====================================================================
-- STEP 7: VERIFICATION
-- =====================================================================
DO $$
DECLARE
  tag_count INTEGER;
  active_tag_count INTEGER;
BEGIN
  -- Count tags
  SELECT COUNT(*) INTO tag_count FROM collaboration_tags;
  SELECT COUNT(*) INTO active_tag_count FROM collaboration_tags WHERE is_active = TRUE;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'COLLABORATION TAGS MIGRATION COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total tags: %', tag_count;
  RAISE NOTICE 'Active tags: %', active_tag_count;
  RAISE NOTICE '';
END $$;

-- Show sample data
SELECT id, slug, label, is_active, sort_order
FROM collaboration_tags
ORDER BY sort_order
LIMIT 10;
