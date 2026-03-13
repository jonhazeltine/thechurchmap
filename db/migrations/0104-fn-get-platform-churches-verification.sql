-- Migration 0104: Create fn_get_platform_churches_for_verification
-- Returns ALL churches linked to a platform (including unapproved) with location as GeoJSON
-- This is used for data quality verification where we need to check all churches, not just approved ones

CREATE OR REPLACE FUNCTION fn_get_platform_churches_for_verification(
  p_platform_id uuid
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
  place_calling_id uuid,
  profile_photo_url text,
  description text,
  approved boolean,
  source text,
  verification_status text,
  google_place_id text,
  data_quality_score integer,
  google_match_confidence numeric
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
    c.place_calling_id,
    c.profile_photo_url,
    c.description,
    c.approved,
    c.source,
    c.verification_status,
    c.google_place_id,
    c.data_quality_score,
    c.google_match_confidence
  FROM public.churches c
  INNER JOIN public.city_platform_churches cpc ON c.id = cpc.church_id
  WHERE cpc.city_platform_id = p_platform_id
  ORDER BY c.name;
END;
$$;

-- Grant execute permission to all roles
GRANT EXECUTE ON FUNCTION fn_get_platform_churches_for_verification(uuid) TO authenticated, anon, service_role;

COMMENT ON FUNCTION fn_get_platform_churches_for_verification IS 'Returns ALL churches linked to a platform (including unapproved) with location as GeoJSON for verification purposes.';
