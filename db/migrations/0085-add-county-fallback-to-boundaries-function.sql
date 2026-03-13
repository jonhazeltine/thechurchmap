-- Migration 0085: Add county fallback to fn_get_boundaries_for_church
-- Returns place boundaries first, falls back to county if no place found

CREATE OR REPLACE FUNCTION fn_get_boundaries_for_church(
  church_lat double precision,
  church_lon double precision
)
RETURNS TABLE(id uuid, name text, type text, area double precision) AS $$
DECLARE
  place_count integer;
BEGIN
  -- First, check if there are any place boundaries for this location
  SELECT COUNT(*) INTO place_count
  FROM boundaries b
  WHERE b.type = 'place'
    AND b.geometry IS NOT NULL
    AND ST_Covers(
      b.geometry::geometry,
      ST_SetSRID(ST_MakePoint(church_lon, church_lat), 4326)
    );
  
  IF place_count > 0 THEN
    -- Return place boundaries (primary)
    RETURN QUERY
    SELECT 
      b.id,
      b.name,
      b.type,
      ST_Area(b.geometry) as area
    FROM boundaries b
    WHERE b.type = 'place'
      AND b.geometry IS NOT NULL
      AND ST_Covers(
        b.geometry::geometry,
        ST_SetSRID(ST_MakePoint(church_lon, church_lat), 4326)
      )
    ORDER BY area DESC;
  ELSE
    -- Fall back to county boundaries
    RETURN QUERY
    SELECT 
      b.id,
      b.name,
      b.type,
      ST_Area(b.geometry) as area
    FROM boundaries b
    WHERE b.type = 'county'
      AND b.geometry IS NOT NULL
      AND ST_Covers(
        b.geometry::geometry,
        ST_SetSRID(ST_MakePoint(church_lon, church_lat), 4326)
      )
    ORDER BY area DESC;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_get_boundaries_for_church IS 'Returns place boundaries that contain the given church coordinates, falling back to county if no place found. Used for auto-linking churches to their geographic locations.';
