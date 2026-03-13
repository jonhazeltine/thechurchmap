-- Migration: Add display location columns for pin adjustment feature
-- These columns allow visual repositioning of church pins without affecting geospatial queries
-- The actual location (PostGIS geometry) is preserved for boundaries and distance calculations

-- =====================================================================
-- STEP 1: Add display_lat and display_lng columns to churches table
-- =====================================================================
ALTER TABLE churches
ADD COLUMN IF NOT EXISTS display_lat DOUBLE PRECISION DEFAULT NULL,
ADD COLUMN IF NOT EXISTS display_lng DOUBLE PRECISION DEFAULT NULL;

-- Add comments to explain the purpose
COMMENT ON COLUMN churches.display_lat IS 'Visual offset latitude for map pin display. NULL means use real location.';
COMMENT ON COLUMN churches.display_lng IS 'Visual offset longitude for map pin display. NULL means use real location.';

-- =====================================================================
-- STEP 2: Update fn_get_churches_simple to include display_lat and display_lng
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_get_churches_simple()
RETURNS TABLE (
  id uuid,
  name text,
  denomination text,
  address text,
  phone text,
  email text,
  website text,
  description text,
  profile_photo_url text,
  collaboration_have text[],
  collaboration_need text[],
  approved boolean,
  created_at timestamptz,
  boundary_ids uuid[],
  location json,
  display_lat double precision,
  display_lng double precision,
  primary_ministry_area json,
  callings json
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.denomination,
    c.address,
    c.phone,
    c.email,
    c.website,
    c.description,
    c.profile_photo_url,
    c.collaboration_have,
    c.collaboration_need,
    c.approved,
    c.created_at,
    c.boundary_ids,
    ST_AsGeoJSON(c.location::geometry)::json as location,
    c.display_lat,
    c.display_lng,
    CASE 
      WHEN c.primary_ministry_area IS NOT NULL 
      THEN ST_AsGeoJSON(c.primary_ministry_area::geometry)::json 
      ELSE NULL 
    END as primary_ministry_area,
    COALESCE((
      SELECT json_agg(json_build_object(
        'id', cl.id,
        'name', cl.name,
        'type', cl.type,
        'description', cl.description,
        'color', cl.color,
        'created_at', cl.created_at
      ))
      FROM callings cl
      INNER JOIN church_calling cc ON cc.calling_id = cl.id
      WHERE cc.church_id = c.id
    ), '[]'::json) as callings
  FROM churches c
  WHERE c.approved = true
  ORDER BY c.name;
END;
$$;

-- =====================================================================
-- STEP 3: Update fn_get_church_by_id to include display_lat and display_lng
-- =====================================================================
-- First check what the current function signature looks like
DROP FUNCTION IF EXISTS fn_get_church_by_id(UUID);

CREATE OR REPLACE FUNCTION fn_get_church_by_id(church_uuid UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  denomination TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  website TEXT,
  email TEXT,
  phone TEXT,
  description TEXT,
  approved BOOLEAN,
  collaboration_have TEXT[],
  collaboration_need TEXT[],
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  location JSON,
  display_lat DOUBLE PRECISION,
  display_lng DOUBLE PRECISION,
  primary_ministry_area JSON,
  place_calling_id UUID,
  boundary_ids UUID[],
  profile_photo_url TEXT,
  banner_image_url TEXT,
  claimed_by UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.denomination,
    c.address,
    c.city,
    c.state,
    c.zip,
    c.website,
    c.email,
    c.phone,
    c.description,
    c.approved,
    c.collaboration_have,
    c.collaboration_need,
    c.created_at,
    c.updated_at,
    ST_AsGeoJSON(c.location)::json as location,
    c.display_lat,
    c.display_lng,
    CASE 
      WHEN c.primary_ministry_area IS NOT NULL 
      THEN ST_AsGeoJSON(c.primary_ministry_area::geometry)::json 
      ELSE NULL 
    END as primary_ministry_area,
    c.place_calling_id,
    c.boundary_ids,
    c.profile_photo_url,
    c.banner_image_url,
    c.claimed_by
  FROM public.churches c
  WHERE c.id = church_uuid;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION fn_get_church_by_id TO anon, authenticated;

COMMENT ON FUNCTION fn_get_church_by_id IS 'Returns a single church by ID with location as GeoJSON and display location offsets';

-- =====================================================================
-- VERIFICATION NOTES
-- =====================================================================
-- After running this migration:
-- 1. churches table has display_lat and display_lng columns
-- 2. fn_get_churches_simple returns display_lat and display_lng
-- 3. fn_get_church_by_id returns display_lat and display_lng
-- 
-- These columns are used by the PinAdjustment component to allow
-- visual repositioning of church pins without affecting geospatial queries.
-- =====================================================================
