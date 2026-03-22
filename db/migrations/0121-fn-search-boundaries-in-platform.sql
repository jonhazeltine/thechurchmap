-- Search boundaries by name within a platform's geographic area
-- Uses the platform's combined_geometry to spatially filter results

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
  -- Get the platform's combined geometry
  SELECT cp.combined_geometry INTO platform_geom
  FROM city_platforms cp
  WHERE cp.id = platform_id;

  IF platform_geom IS NULL THEN
    -- Fallback: no geometry, return empty
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
'Searches boundaries by name within a platform''s combined geographic area.
Excludes census tracts from user-facing search results.
Used by the Filter by Place feature in the sidebar.';
