-- Migration 0106: Fix fn_get_boundaries_for_church to return ALL matching boundary types
-- Previously only returned place boundaries (or county fallback), which caused the 
-- boundary cleanup tool to incorrectly hide churches that were within ZIP/county/tract boundaries
-- but not within a place boundary.

CREATE OR REPLACE FUNCTION fn_get_boundaries_for_church(
  church_lat double precision,
  church_lon double precision
)
RETURNS TABLE(id uuid, name text, type text, area double precision) AS $$
BEGIN
  -- Return ALL boundaries that contain this point, regardless of type
  -- This ensures the boundary cleanup tool checks against all platform boundaries
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.type,
    ST_Area(b.geometry) as area
  FROM boundaries b
  WHERE b.geometry IS NOT NULL
    AND ST_Covers(
      b.geometry::geometry,
      ST_SetSRID(ST_MakePoint(church_lon, church_lat), 4326)
    )
  ORDER BY 
    -- Order by type priority (smaller/more specific first)
    CASE b.type 
      WHEN 'place' THEN 1
      WHEN 'tract' THEN 2
      WHEN 'zip' THEN 3
      WHEN 'county' THEN 4
      WHEN 'state' THEN 5
      ELSE 6
    END,
    area ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_get_boundaries_for_church IS 'Returns ALL boundaries (place, county, zip, tract, state) that contain the given church coordinates. Used for boundary cleanup tool to check if churches are within platform boundaries.';
