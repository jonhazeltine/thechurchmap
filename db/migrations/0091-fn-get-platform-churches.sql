-- =====================================================================
-- PLATFORM-SPECIFIC CHURCHES RPC FUNCTION
-- =====================================================================
-- Migration 0091: Efficient query for loading all churches linked to a platform
-- 
-- This function is used when viewing a platform map. It directly joins
-- city_platform_churches with churches to return ONLY churches linked
-- to that platform, avoiding the need to fetch all churches and filter.
--
-- This is critical for scaling to 320,000+ churches across many platforms.
-- =====================================================================

-- Add index for efficient platform church lookups
CREATE INDEX IF NOT EXISTS idx_city_platform_churches_platform_status 
ON city_platform_churches(city_platform_id, status);

-- Create the platform-specific churches function
CREATE OR REPLACE FUNCTION public.fn_get_platform_churches(
  p_platform_id UUID
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
  INNER JOIN public.city_platform_churches cpc 
    ON c.id = cpc.church_id
  WHERE cpc.city_platform_id = p_platform_id
    AND cpc.status IN ('visible', 'featured')
    AND c.approved = true
  ORDER BY c.name;
END;
$$;

-- Grant execute permission to all roles
GRANT EXECUTE ON FUNCTION fn_get_platform_churches(uuid) TO authenticated, anon, service_role;

COMMENT ON FUNCTION fn_get_platform_churches IS 
  'Returns all approved churches linked to a specific city platform. Used for platform map view to efficiently load only platform-relevant churches without hitting global limits.';
