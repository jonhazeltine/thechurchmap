-- Migration 0039: Add profile_photo_url to fn_get_churches_simple
-- This allows the church list to show uploaded logos

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
