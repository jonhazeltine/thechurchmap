-- Function to get boundaries with geometry converted to GeoJSON
-- This is needed because raw PostGIS geometry returns as WKB hex format
CREATE OR REPLACE FUNCTION fn_get_boundaries_as_geojson(boundary_uuid_array UUID[])
RETURNS TABLE (
  id UUID,
  name TEXT,
  type TEXT,
  geometry JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.type,
    ST_AsGeoJSON(b.geometry)::JSONB as geometry
  FROM boundaries b
  WHERE b.id = ANY(boundary_uuid_array);
END;
$$ LANGUAGE plpgsql;
