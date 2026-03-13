-- RPC function to aggregate crime incidents to census tracts
-- This performs a spatial join in PostGIS which is much faster than client-side
-- Run in Supabase SQL Editor

CREATE OR REPLACE FUNCTION fn_aggregate_crime_to_tracts(
  p_city TEXT,
  p_state TEXT,
  p_year INTEGER DEFAULT NULL
)
RETURNS TABLE (
  tract_fips TEXT,
  tract_name TEXT,
  normalized_type TEXT,
  incident_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.external_id AS tract_fips,
    b.name AS tract_name,
    ci.normalized_type,
    COUNT(*)::BIGINT AS incident_count
  FROM crime_incidents ci
  JOIN boundaries b ON (
    b.type = 'census_tract' 
    AND ST_Contains(b.geometry::geometry, ci.location::geometry)
  )
  WHERE 
    ci.city = p_city
    AND ci.state = p_state
    AND ci.normalized_type IS NOT NULL
    AND ci.location IS NOT NULL
    AND (p_year IS NULL OR EXTRACT(YEAR FROM ci.incident_date) = p_year)
  GROUP BY b.external_id, b.name, ci.normalized_type;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION fn_aggregate_crime_to_tracts TO authenticated;
GRANT EXECUTE ON FUNCTION fn_aggregate_crime_to_tracts TO anon;
