-- Fix fn_get_boundaries_by_ids to properly handle UUID type comparison
-- The previous version had issues comparing uuid with text in the WHERE clause

DROP FUNCTION IF EXISTS fn_get_boundaries_by_ids(text[]);
DROP FUNCTION IF EXISTS fn_get_boundaries_by_ids(uuid[]);

CREATE OR REPLACE FUNCTION fn_get_boundaries_by_ids(boundary_ids text[])
RETURNS TABLE (
  id text,
  name text,
  type text,
  external_id text,
  geometry jsonb,
  centroid_lng double precision,
  centroid_lat double precision
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id::text,
    b.name,
    b.type,
    b.external_id,
    ST_AsGeoJSON(b.geometry)::jsonb as geometry,
    ST_X(ST_Centroid(b.geometry::geometry)) as centroid_lng,
    ST_Y(ST_Centroid(b.geometry::geometry)) as centroid_lat
  FROM boundaries b
  WHERE b.id IN (SELECT unnest(boundary_ids)::uuid);
END;
$$;

COMMENT ON FUNCTION fn_get_boundaries_by_ids IS 
'Fetches boundaries by their IDs with geometry as GeoJSON.
Used for loading initial selections in the boundary map picker.
Returns centroids computed from geometry for map positioning.';
