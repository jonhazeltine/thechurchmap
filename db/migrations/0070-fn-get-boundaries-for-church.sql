-- Function to find place and county subdivision boundaries containing a point
-- Uses ST_Covers for geography type and returns area for deduplication
-- Skip census_tract boundaries

CREATE OR REPLACE FUNCTION fn_get_boundaries_for_church(
  church_lat double precision,
  church_lon double precision
)
RETURNS TABLE(id uuid, name text, type text, area double precision) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.type,
    ST_Area(b.geometry) as area
  FROM boundaries b
  WHERE b.type IN ('place', 'county subdivision')
    AND b.geometry IS NOT NULL
    AND ST_Covers(
      b.geometry,
      ST_SetSRID(ST_MakePoint(church_lon, church_lat), 4326)::geography
    )
  ORDER BY area DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_get_boundaries_for_church(double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_get_boundaries_for_church(double precision, double precision) TO anon;
GRANT EXECUTE ON FUNCTION fn_get_boundaries_for_church(double precision, double precision) TO service_role;

-- Test the function with Grand Rapids coordinates
-- SELECT * FROM fn_get_boundaries_for_church(42.9634, -85.6681);
