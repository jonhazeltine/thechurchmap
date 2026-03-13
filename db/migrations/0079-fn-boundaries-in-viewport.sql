-- Create function to fetch boundaries within a viewport (bounding box)
-- Returns boundaries that intersect with the provided bounding box
-- Optimized for interactive map selection

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
BEGIN
  -- Create bounding box geometry
  bbox_geom := ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)::geography;
  
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
  ORDER BY b.name
  LIMIT limit_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION fn_boundaries_in_viewport TO anon, authenticated;

COMMENT ON FUNCTION fn_boundaries_in_viewport IS 
'Fetches boundaries that intersect with a viewport bounding box. 
Used for interactive map-based boundary selection.
Returns boundary id, name, type, GeoJSON geometry, and centroid coordinates.';
