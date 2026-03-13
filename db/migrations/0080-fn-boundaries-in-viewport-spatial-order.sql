-- Update fn_boundaries_in_viewport to order by distance from viewport center instead of alphabetically
-- This prevents geographic bias where northern boundaries get cut off due to alphabetical ordering

CREATE OR REPLACE FUNCTION fn_boundaries_in_viewport(
  min_lng double precision,
  min_lat double precision,
  max_lng double precision,
  max_lat double precision,
  boundary_type text DEFAULT NULL,
  limit_count integer DEFAULT 500
)
RETURNS TABLE (
  id uuid,
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
DECLARE
  bbox_geom geography;
  center_lng double precision;
  center_lat double precision;
  center_point geography;
BEGIN
  -- Create bounding box geometry
  bbox_geom := ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography;
  
  -- Calculate viewport center for distance-based ordering
  center_lng := (min_lng + max_lng) / 2;
  center_lat := (min_lat + max_lat) / 2;
  center_point := ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography;
  
  RETURN QUERY
  SELECT
    b.id,
    b.name,
    b.type,
    b.external_id,
    ST_AsGeoJSON(b.geometry)::jsonb as geometry,
    ST_X(ST_Centroid(b.geometry::geometry)) as centroid_lng,
    ST_Y(ST_Centroid(b.geometry::geometry)) as centroid_lat
  FROM boundaries b
  WHERE ST_Intersects(b.geometry, bbox_geom)
    AND (boundary_type IS NULL OR b.type = boundary_type)
  ORDER BY ST_Distance(ST_Centroid(b.geometry::geometry)::geography, center_point)
  LIMIT limit_count;
END;
$$;

COMMENT ON FUNCTION fn_boundaries_in_viewport IS 
'Fetches boundaries that intersect with a viewport bounding box.
Orders results by distance from viewport center (closest first) to avoid geographic bias.
Used for interactive map-based boundary selection.';
