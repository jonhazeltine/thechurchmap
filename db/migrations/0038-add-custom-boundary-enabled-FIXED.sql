-- Migration: Add custom_boundary_enabled to church_calling
-- Purpose: Allow churches to flag which callings should have custom boundary drawing enabled

-- Add the column with default false
ALTER TABLE church_calling
ADD COLUMN IF NOT EXISTS custom_boundary_enabled boolean DEFAULT false NOT NULL;

-- Add index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_church_calling_custom_boundary 
ON church_calling(church_id, custom_boundary_enabled) 
WHERE custom_boundary_enabled = true;

-- Update fn_get_church_by_id to include custom_boundary_enabled in callings
CREATE OR REPLACE FUNCTION fn_get_church_by_id(church_uuid uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
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
        'custom_boundary_enabled', cc.custom_boundary_enabled,
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

GRANT EXECUTE ON FUNCTION fn_get_church_by_id(uuid) TO anon, authenticated;
