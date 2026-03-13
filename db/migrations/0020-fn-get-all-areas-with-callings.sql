-- Migration: Create function to get all ministry areas with their church and calling information
-- This enables the "Show All Ministry Areas" feature with color coding by calling type

CREATE OR REPLACE FUNCTION fn_get_all_areas_with_callings()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  -- Get all areas with their church info and primary calling
  SELECT json_agg(
    json_build_object(
      'id', a.id,
      'name', a.name,
      'type', a.type,
      'church_id', a.church_id,
      'church_name', c.name,
      'geometry', ST_AsGeoJSON(a.geometry)::json,
      'calling_type', (
        SELECT cl.type
        FROM callings cl
        INNER JOIN church_calling cc ON cc.calling_id = cl.id
        WHERE cc.church_id = a.church_id
        ORDER BY cc.created_at ASC
        LIMIT 1
      ),
      'calling_color', (
        SELECT cl.color
        FROM callings cl
        INNER JOIN church_calling cc ON cc.calling_id = cl.id
        WHERE cc.church_id = a.church_id
        ORDER BY cc.created_at ASC
        LIMIT 1
      ),
      'created_at', a.created_at
    )
  ) INTO result
  FROM areas a
  LEFT JOIN churches c ON c.id = a.church_id;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_get_all_areas_with_callings() TO anon, authenticated;

COMMENT ON FUNCTION fn_get_all_areas_with_callings IS 'Returns all ministry areas with church and calling information for map visualization';
