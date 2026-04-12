-- Migration 0124: Lightweight church pin function for fast map rendering
--
-- fn_get_churches_simple calls ST_AsGeoJSON(c.location) on every row,
-- which is the single most expensive operation per church (~16s for
-- 3,738 rows in Detroit). For pin rendering we only need display_lat
-- and display_lng (plain number columns, no conversion needed).
--
-- This function returns the minimum fields needed for map pins plus
-- enough data for basic filtering (collab_have/need, denomination,
-- county_fips). Callings, boundary names, and full geometry are
-- fetched separately by the enrichment phase.

CREATE OR REPLACE FUNCTION fn_get_churches_slim()
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
  display_lat double precision,
  display_lng double precision,
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
    c.display_lat,
    c.display_lng,
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
  WHERE c.approved = true
  ORDER BY c.name;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_get_churches_slim() TO authenticated, anon, service_role;

COMMENT ON FUNCTION fn_get_churches_slim IS 'Lightweight church query for fast pin rendering. Skips ST_AsGeoJSON geometry conversion and LEFT JOIN on callings. Uses display_lat/display_lng directly.';
