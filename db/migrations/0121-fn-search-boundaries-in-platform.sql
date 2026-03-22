-- Search boundaries by name within a platform's geographic area
-- Uses combined_geometry if available, otherwise unions the platform's boundary geometries

CREATE OR REPLACE FUNCTION fn_search_boundaries_in_platform(
  search_query text,
  platform_id uuid,
  boundary_type text DEFAULT NULL,
  limit_count integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  external_id text,
  state_fips text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  platform_geom geography;
BEGIN
  -- Try combined_geometry first
  SELECT cp.combined_geometry INTO platform_geom
  FROM city_platforms cp
  WHERE cp.id = platform_id;

  -- Fallback: union the platform's boundary geometries
  IF platform_geom IS NULL THEN
    SELECT ST_Union(b.geometry::geometry)::geography INTO platform_geom
    FROM city_platform_boundaries cpb
    JOIN boundaries b ON b.id = cpb.boundary_id
    WHERE cpb.city_platform_id = platform_id;
  END IF;

  IF platform_geom IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    b.name,
    b.type,
    b.external_id,
    b.state_fips
  FROM boundaries b
  WHERE b.name ILIKE ('%' || search_query || '%')
    AND ST_Intersects(b.geometry, platform_geom)
    AND (boundary_type IS NULL OR b.type = boundary_type)
    AND b.type != 'census_tract'
  ORDER BY b.name
  LIMIT limit_count;
END;
$$;

COMMENT ON FUNCTION fn_search_boundaries_in_platform IS
'Searches boundaries by name within a platform''s geographic area.
Uses combined_geometry if set, otherwise unions the platform boundary geometries.
Excludes census tracts from user-facing search results.';
