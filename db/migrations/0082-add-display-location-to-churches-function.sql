-- Migration 0082: Add display_lat and display_lng to fn_get_churches_simple
-- These columns allow visual repositioning of church pins without affecting geospatial queries
-- The actual location (PostGIS geometry) is preserved for boundaries and distance calculations

-- First ensure the columns exist on the table
ALTER TABLE churches
ADD COLUMN IF NOT EXISTS display_lat DOUBLE PRECISION DEFAULT NULL,
ADD COLUMN IF NOT EXISTS display_lng DOUBLE PRECISION DEFAULT NULL;

-- Add comments to explain the purpose
COMMENT ON COLUMN churches.display_lat IS 'Visual offset latitude for map pin display. NULL means use real location.';
COMMENT ON COLUMN churches.display_lng IS 'Visual offset longitude for map pin display. NULL means use real location.';

-- Drop and recreate the function with display_lat and display_lng
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
  display_lat double precision,
  display_lng double precision,
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
    c.display_lat,
    c.display_lng,
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

COMMENT ON FUNCTION fn_get_churches_simple IS 'Returns ALL approved churches with display_lat/display_lng for pin positioning. Region filtering is handled by the API layer.';
