-- Migration 0036: Add function to update primary ministry area
-- This bypasses PostgREST schema cache issues

CREATE OR REPLACE FUNCTION fn_update_primary_ministry_area(
  church_uuid uuid,
  area_wkt text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  -- Update the church's primary ministry area
  UPDATE churches
  SET primary_ministry_area = area_wkt::geography
  WHERE id = church_uuid;

  -- Return the updated church data
  SELECT json_build_object(
    'id', c.id,
    'name', c.name,
    'primary_ministry_area', CASE 
      WHEN c.primary_ministry_area IS NOT NULL 
      THEN ST_AsGeoJSON(c.primary_ministry_area::geometry)::json 
      ELSE NULL 
    END
  ) INTO result
  FROM churches c
  WHERE c.id = church_uuid;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION fn_delete_primary_ministry_area(
  church_uuid uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE churches
  SET primary_ministry_area = NULL
  WHERE id = church_uuid;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_update_primary_ministry_area(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_delete_primary_ministry_area(uuid) TO anon, authenticated;

COMMENT ON FUNCTION fn_update_primary_ministry_area IS 'Updates a church primary ministry area using WKT geometry';
COMMENT ON FUNCTION fn_delete_primary_ministry_area IS 'Removes a church primary ministry area';
