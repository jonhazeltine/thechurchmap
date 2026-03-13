-- Migration: Mark known duplicate churches as superseded
-- Run this AFTER 20260205_superseded_by_church.sql migration
-- 
-- This script helps identify and mark bulk import duplicates that have been
-- replaced by platform-curated churches

-- First, let's identify potential duplicates by Google Place ID
-- (Churches with the same google_place_id but different IDs)
-- 
-- To view duplicates before marking them:
-- SELECT 
--   c1.id as bulk_import_id,
--   c1.name as bulk_import_name,
--   c1.managed_by_platform as bulk_managed,
--   c2.id as platform_id,
--   c2.name as platform_name,
--   c2.managed_by_platform as platform_managed,
--   c1.google_place_id
-- FROM churches c1
-- JOIN churches c2 ON c1.google_place_id = c2.google_place_id 
--   AND c1.id != c2.id
-- WHERE c1.managed_by_platform = false 
--   AND c2.managed_by_platform = true
-- ORDER BY c1.google_place_id;

-- Mark bulk imports as superseded when a platform-managed version exists with same Google Place ID
-- Prefer visible churches over hidden ones, and most recently updated for determinism
UPDATE churches c1
SET superseded_by_church_id = (
  SELECT c2.id 
  FROM churches c2 
  LEFT JOIN city_platform_churches cpc ON c2.id = cpc.church_id AND cpc.status IN ('visible', 'featured')
  WHERE c2.google_place_id = c1.google_place_id 
    AND c2.id != c1.id
    AND c2.managed_by_platform = true
  ORDER BY 
    CASE WHEN cpc.church_id IS NOT NULL THEN 0 ELSE 1 END,  -- Prefer visible/featured
    c2.updated_at DESC NULLS LAST,                          -- Most recently updated
    c2.created_at DESC NULLS LAST                           -- Fallback to created_at
  LIMIT 1
)
WHERE c1.managed_by_platform = false
  AND c1.google_place_id IS NOT NULL
  AND c1.superseded_by_church_id IS NULL
  AND EXISTS (
    SELECT 1 FROM churches c2 
    WHERE c2.google_place_id = c1.google_place_id 
      AND c2.id != c1.id
      AND c2.managed_by_platform = true
  );

-- Report how many were updated
-- (Run this after the UPDATE to see results)
-- SELECT COUNT(*) as superseded_count 
-- FROM churches 
-- WHERE superseded_by_church_id IS NOT NULL;

-- To manually mark specific known duplicates, use:
-- UPDATE churches 
-- SET superseded_by_church_id = '<new_church_uuid>'
-- WHERE id = '<old_church_uuid>';
--
-- Example: Mark "test church" as superseded by "The Best Church Ever"
-- First find the IDs:
-- SELECT id, name FROM churches WHERE name ILIKE '%test church%' OR name ILIKE '%best church ever%';
-- Then update:
-- UPDATE churches SET superseded_by_church_id = '<best_church_ever_id>' WHERE id = '<test_church_id>';
