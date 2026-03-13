-- Function to get boundary geometries as GeoJSON
-- Converts PostGIS geometry to GeoJSON format for Mapbox rendering

CREATE OR REPLACE FUNCTION fn_get_boundaries_geojson(boundary_ids uuid[])
RETURNS TABLE (id uuid, geometry jsonb)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    b.id,
    ST_AsGeoJSON(b.geometry)::jsonb as geometry
  FROM public.boundaries b
  WHERE b.id = ANY(boundary_ids)
    AND b.geometry IS NOT NULL;
$$;

COMMENT ON FUNCTION fn_get_boundaries_geojson IS 
  'Returns boundary geometries as GeoJSON for the given list of boundary IDs.';
