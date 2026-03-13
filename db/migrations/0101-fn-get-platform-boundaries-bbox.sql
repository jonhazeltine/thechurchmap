-- Function to get bounding box from platform boundaries
-- Used for Google Places import when center coordinates aren't available

CREATE OR REPLACE FUNCTION fn_get_platform_boundaries_bbox(p_platform_id UUID)
RETURNS TABLE (
  min_lat DOUBLE PRECISION,
  max_lat DOUBLE PRECISION,
  min_lng DOUBLE PRECISION,
  max_lng DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ST_YMin(extent)::DOUBLE PRECISION as min_lat,
    ST_YMax(extent)::DOUBLE PRECISION as max_lat,
    ST_XMin(extent)::DOUBLE PRECISION as min_lng,
    ST_XMax(extent)::DOUBLE PRECISION as max_lng
  FROM (
    SELECT ST_Extent(b.geometry::geometry) as extent
    FROM city_platform_boundaries cpb
    JOIN boundaries b ON b.id = cpb.boundary_id
    WHERE cpb.city_platform_id = p_platform_id
      AND b.geometry IS NOT NULL
  ) sub
  WHERE extent IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_get_platform_boundaries_bbox(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_get_platform_boundaries_bbox(UUID) TO service_role;
