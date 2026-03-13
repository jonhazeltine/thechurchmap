-- Migration 0067: Unified Region Visibility
-- Makes ALL churches (manual and OSM) respect region_settings visibility toggles
-- 
-- IMPORTANT: Run this migration in Supabase SQL Editor
-- This migration:
-- 1. Backfills county_fips for manual churches that don't have it
-- 2. Updates fn_get_churches_simple to filter ALL sources by region_settings

-- ============================================================================
-- STEP 1: Backfill county_fips for manual churches
-- Uses the existing find_county_from_tract function to assign county FIPS
-- ============================================================================

-- First, let's update churches that have a location but no county_fips
-- We use a subquery to find the census tract containing the church, then extract county FIPS
UPDATE public.churches c
SET county_fips = (
  SELECT LEFT(b.external_id, 5)
  FROM public.boundaries b
  WHERE b.type = 'tract'
    AND ST_Contains(b.geometry::geometry, c.location::geometry)
  LIMIT 1
)
WHERE c.county_fips IS NULL
  AND c.location IS NOT NULL;

-- Log how many were updated (this will show in query results)
DO $$
DECLARE
  updated_count integer;
  remaining_null integer;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM public.churches 
  WHERE county_fips IS NOT NULL AND (source = 'manual' OR source IS NULL);
  
  SELECT COUNT(*) INTO remaining_null
  FROM public.churches 
  WHERE county_fips IS NULL AND location IS NOT NULL;
  
  RAISE NOTICE 'Manual churches with county_fips: %', updated_count;
  RAISE NOTICE 'Churches still missing county_fips (no tract match): %', remaining_null;
END $$;

-- ============================================================================
-- STEP 2: Update fn_get_churches_simple to filter ALL churches by region
-- Churches are now visible only if:
--   - Their county_fips matches an enabled region, OR
--   - They have no county_fips set (failsafe for data issues)
-- ============================================================================

DROP FUNCTION IF EXISTS fn_get_churches_simple(uuid, text[], text[], text[]);

CREATE OR REPLACE FUNCTION fn_get_churches_simple(
  p_boundary_id uuid DEFAULT NULL,
  p_collab_have text[] DEFAULT NULL,
  p_collab_need text[] DEFAULT NULL,
  p_calling_types text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  city text,
  state text,
  zip text,
  denomination text,
  website text,
  email text,
  phone text,
  location jsonb,
  primary_ministry_area jsonb,
  place_calling_id uuid,
  collaboration_have text[],
  collaboration_need text[],
  profile_photo_url text,
  banner_image_url text,
  description text,
  approved boolean,
  claimed_by uuid,
  boundary_ids uuid[],
  prayer_auto_approve boolean,
  prayer_name_display_mode text,
  source text,
  external_id text,
  county_fips text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.address,
    c.city,
    c.state,
    c.zip,
    c.denomination,
    c.website,
    c.email,
    c.phone,
    CASE 
      WHEN c.location IS NOT NULL THEN ST_AsGeoJSON(c.location)::jsonb
      ELSE NULL
    END as location,
    CASE 
      WHEN c.primary_ministry_area IS NOT NULL THEN ST_AsGeoJSON(c.primary_ministry_area)::jsonb
      ELSE NULL
    END as primary_ministry_area,
    c.place_calling_id,
    c.collaboration_have,
    c.collaboration_need,
    c.profile_photo_url,
    c.banner_image_url,
    c.description,
    c.approved,
    c.claimed_by,
    c.boundary_ids,
    c.prayer_auto_approve,
    c.prayer_name_display_mode,
    c.source,
    c.external_id,
    c.county_fips,
    c.created_at,
    c.updated_at
  FROM public.churches c
  LEFT JOIN public.church_calling cc ON c.id = cc.church_id
  LEFT JOIN public.callings cal ON cc.calling_id = cal.id
  WHERE c.approved = true
    -- Region visibility filter: show church if county is enabled OR if no county_fips (failsafe)
    AND (
      c.county_fips IS NULL
      OR EXISTS (
        SELECT 1 FROM public.region_settings rs
        WHERE rs.is_enabled = true
          AND rs.region_type = 'county'
          AND rs.region_id = c.county_fips
      )
    )
    -- Existing filters
    AND (p_boundary_id IS NULL OR p_boundary_id = ANY(c.boundary_ids))
    AND (p_collab_have IS NULL OR c.collaboration_have && p_collab_have)
    AND (p_collab_need IS NULL OR c.collaboration_need && p_collab_need)
    AND (p_calling_types IS NULL OR cal.type = ANY(p_calling_types))
  GROUP BY c.id
  ORDER BY c.name;
END;
$$;

-- Grant execute permission to all roles
GRANT EXECUTE ON FUNCTION fn_get_churches_simple(uuid, text[], text[], text[]) TO authenticated, anon, service_role;

COMMENT ON FUNCTION fn_get_churches_simple IS 'Returns approved churches filtered by region visibility settings. All churches (manual and OSM) now respect region_settings.';
