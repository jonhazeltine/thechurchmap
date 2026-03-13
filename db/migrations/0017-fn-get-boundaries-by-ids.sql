-- Function to get boundaries by IDs with GeoJSON geometry
-- Used by boundary search API to return full boundary data for hover preview

CREATE OR REPLACE FUNCTION fn_get_boundaries_by_ids(boundary_ids text[])
RETURNS TABLE (
  id text,
  name text,
  type text,
  geometry jsonb
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id,
    b.name,
    b.type,
    ST_AsGeoJSON(b.geometry)::jsonb as geometry
  FROM boundaries b
  WHERE b.id = ANY(boundary_ids);
END;
$$;
