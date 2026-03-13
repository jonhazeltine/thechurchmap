-- Function to fetch boundaries by their IDs with proper GeoJSON geometry
-- This is more reliable than using fn_boundaries_in_viewport with world bounds
-- because it directly queries the specific boundaries requested

CREATE OR REPLACE FUNCTION fn_get_boundaries_by_ids(boundary_ids uuid[])
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  external_id text,
  geometry json,
  centroid_lng double precision,
  centroid_lat double precision
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
    b.external_id,
    ST_AsGeoJSON(b.geometry)::json as geometry,
    b.centroid_lng,
    b.centroid_lat
  FROM boundaries b
  WHERE b.id = ANY(boundary_ids)
    AND b.geometry IS NOT NULL;
END;
$$;

-- Grant execute permission to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION fn_get_boundaries_by_ids(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_get_boundaries_by_ids(uuid[]) TO anon;
