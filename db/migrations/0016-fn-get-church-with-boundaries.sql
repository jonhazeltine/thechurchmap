-- Migration: Update fn_get_church_by_id to return boundary geometries
-- Sprint 1.6: Return attached boundaries with full geometry for map rendering

CREATE OR REPLACE FUNCTION fn_get_church_by_id(church_uuid uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  -- Get church with location as GeoJSON and include boundaries
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
    'pastor_name', c.pastor_name,
    'description', c.description,
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
    'callings', COALESCE((
      SELECT json_agg(json_build_object(
        'id', cl.id,
        'name', cl.name,
        'category', cl.category,
        'color', cl.color
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
        'geometry', ST_AsGeoJSON(b.geometry)::json
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
