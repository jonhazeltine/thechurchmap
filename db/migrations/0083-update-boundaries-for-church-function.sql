-- Migration 0083: Update fn_get_boundaries_for_church to use only place type
-- Removes county subdivision from the function since we've cleaned up that data

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
  WHERE b.type = 'place'  -- Only use place type now
    AND b.geometry IS NOT NULL
    AND ST_Covers(
      b.geometry::geometry,
      ST_SetSRID(ST_MakePoint(church_lon, church_lat), 4326)
    )
  ORDER BY area DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_get_boundaries_for_church IS 'Returns place boundaries that contain the given church coordinates. Used for auto-linking churches to their geographic places.';
