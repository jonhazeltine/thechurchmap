-- Migration 0066: Increase church query limit to 10000
-- Adds explicit LIMIT 10000 to fn_get_churches_simple to override Supabase's default 1000 row limit

DROP FUNCTION IF EXISTS fn_get_churches_simple();
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
    AND (p_boundary_id IS NULL OR p_boundary_id = ANY(c.boundary_ids))
    AND (p_collab_have IS NULL OR c.collaboration_have && p_collab_have)
    AND (p_collab_need IS NULL OR c.collaboration_need && p_collab_need)
    AND (p_calling_types IS NULL OR cal.type = ANY(p_calling_types))
  GROUP BY c.id
  ORDER BY c.name
  LIMIT 10000;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_get_churches_simple(uuid, text[], text[], text[]) TO authenticated, anon, service_role;

COMMENT ON FUNCTION fn_get_churches_simple IS 'Returns up to 10000 approved churches with location/area as GeoJSON, includes source and county_fips for region filtering';
