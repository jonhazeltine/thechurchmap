-- Migration 0035: Add primary_ministry_area to church query functions
-- Updates fn_get_churches_simple and fn_get_church_by_id to return primary ministry area as GeoJSON

-- Update fn_get_churches_simple to include primary_ministry_area
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
  collaboration_have text[],
  collaboration_need text[],
  approved boolean,
  created_at timestamptz,
  boundary_ids uuid[],
  location json,
  primary_ministry_area json
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
    c.collaboration_have,
    c.collaboration_need,
    c.approved,
    c.created_at,
    c.boundary_ids,
    ST_AsGeoJSON(c.location::geometry)::json as location,
    CASE 
      WHEN c.primary_ministry_area IS NOT NULL 
      THEN ST_AsGeoJSON(c.primary_ministry_area::geometry)::json 
      ELSE NULL 
    END as primary_ministry_area
  FROM churches c
  WHERE c.approved = true
  ORDER BY c.name;
END;
$$;

-- Update fn_get_church_by_id to include primary_ministry_area
CREATE OR REPLACE FUNCTION fn_get_church_by_id(church_uuid uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  -- Get church with location as GeoJSON and include boundaries and primary ministry area
  SELECT json_build_object(
    'id', c.id,
    'name', c.name,
    'address', c.address,
    'city', c.city,
    'state', c.state,
    'zip', c.zip,
    'phone', c.phone,
    'email', c.email,
    'website', c.website,
    'denomination', c.denomination,
    'description', c.description,
    'profile_photo_url', c.profile_photo_url,
    'approved', c.approved,
    'claimed_by', c.claimed_by,
    'place_calling_id', c.place_calling_id,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'location', CASE 
      WHEN c.location IS NOT NULL THEN 
        json_build_object(
          'type', 'Point',
          'coordinates', json_build_array(
            ST_X(c.location::geometry),
            ST_Y(c.location::geometry)
          )
        )
      ELSE NULL
    END,
    'primary_ministry_area', CASE 
      WHEN c.primary_ministry_area IS NOT NULL 
      THEN ST_AsGeoJSON(c.primary_ministry_area::geometry)::json 
      ELSE NULL 
    END,
    'callings', COALESCE((
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
    ), '[]'::json),
    'collaboration_have', c.collaboration_have,
    'collaboration_need', c.collaboration_need,
    'boundary_ids', c.boundary_ids,
    'boundaries', COALESCE((
      SELECT json_agg(json_build_object(
        'id', b.id,
        'name', b.name,
        'type', b.type,
        'geometry', ST_AsGeoJSON(b.geometry)::json,
        'created_at', b.created_at
      ))
      FROM boundaries b
      WHERE b.id = ANY(c.boundary_ids)
    ), '[]'::json)
  ) INTO result
  FROM churches c
  WHERE c.id = church_uuid;

  RETURN result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_get_church_by_id(uuid) TO anon, authenticated;

COMMENT ON FUNCTION fn_get_church_by_id IS 'Returns a single church by ID with location as GeoJSON, primary ministry area, callings, and boundaries';
