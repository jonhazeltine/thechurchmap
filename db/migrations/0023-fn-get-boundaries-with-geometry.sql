-- Create a simpler function that accepts JSON array of UUIDs and returns boundaries with GeoJSON
-- This avoids the UUID/text array type mismatch issue

CREATE OR REPLACE FUNCTION fn_get_boundaries_with_geometry(ids_json text)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  geometry jsonb
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  id_array uuid[];
BEGIN
  -- Parse JSON array of UUID strings into PostgreSQL UUID array
  SELECT array_agg(elem::uuid)
  INTO id_array
  FROM jsonb_array_elements_text(ids_json::jsonb) AS elem;
  
  RETURN QUERY
  SELECT
    b.id,
    b.name,
    b.type,
    ST_AsGeoJSON(b.geometry)::jsonb as geometry
  FROM boundaries b
  WHERE b.id = ANY(id_array);
END;
$$;
