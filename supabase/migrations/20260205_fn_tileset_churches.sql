-- Function to get all churches that should appear in the tileset
-- Logic:
-- 1. Visible/featured platform churches → INCLUDE (curated data)
-- 2. Churches that were managed but are hidden/removed → EXCLUDE
-- 3. Bulk imports INSIDE any active platform boundary → EXCLUDE (platform should curate)
-- 4. Bulk imports OUTSIDE all platform boundaries → INCLUDE (no platform coverage)
-- 5. Superseded churches → EXCLUDE
--
-- IMPORTANT: Uses city_platform_boundaries + boundaries tables directly
-- This ensures coverage is always current when platforms change their boundaries.
-- The 'excluded' role boundaries are subtracted from the union.
--
-- Edge cases:
-- - No active platforms at all: All bulk imports included
-- - Active platforms but no included boundaries: Treated as "no coverage" (all bulk imports included)
-- - Only excluded boundaries (no included): No coverage to exclude from, bulk imports included
-- - Coverage exists but geometry is empty after exclusion: Bulk imports included

CREATE OR REPLACE FUNCTION fn_tileset_churches()
RETURNS TABLE (
  id UUID,
  name TEXT,
  city TEXT,
  state TEXT,
  lng DOUBLE PRECISION,
  lat DOUBLE PRECISION
) AS $$
DECLARE
  platform_coverage_geom geometry;
  active_platform_count integer;
BEGIN
  -- First check if there are any active platforms at all
  SELECT COUNT(*) INTO active_platform_count
  FROM city_platforms
  WHERE is_active = true;

  -- If no active platforms, skip geometry computation entirely
  IF active_platform_count = 0 THEN
    platform_coverage_geom := NULL;
    RAISE NOTICE 'No active platforms found - including all bulk imports';
  ELSE
    -- Compute platform coverage from the actual boundaries table
    -- This ensures we always use current boundary data (not a cached combined_geometry)
    -- Included/primary boundaries are unioned, excluded boundaries are subtracted
    WITH 
      included_boundaries AS (
        -- Get all included and primary boundaries from active platforms
        SELECT ST_Union(b.geometry::geometry) as geom
        FROM city_platforms cp
        INNER JOIN city_platform_boundaries cpb ON cpb.city_platform_id = cp.id
        INNER JOIN boundaries b ON b.id = cpb.boundary_id
        WHERE cp.is_active = true
          AND cpb.role IN ('primary', 'included')
          AND b.geometry IS NOT NULL
      ),
      excluded_boundaries AS (
        -- Get all excluded boundaries from active platforms
        SELECT ST_Union(b.geometry::geometry) as geom
        FROM city_platforms cp
        INNER JOIN city_platform_boundaries cpb ON cpb.city_platform_id = cp.id
        INNER JOIN boundaries b ON b.id = cpb.boundary_id
        WHERE cp.is_active = true
          AND cpb.role = 'excluded'
          AND b.geometry IS NOT NULL
      )
    SELECT 
      CASE 
        -- Both included and excluded exist: subtract excluded from included
        WHEN inc.geom IS NOT NULL AND exc.geom IS NOT NULL 
          THEN ST_Difference(inc.geom, exc.geom)
        -- Only included exists: use as-is
        WHEN inc.geom IS NOT NULL
          THEN inc.geom
        -- No included boundaries (even if excluded exist): no coverage
        ELSE NULL
      END
    INTO platform_coverage_geom
    FROM included_boundaries inc
    LEFT JOIN excluded_boundaries exc ON true;
    
    -- Check if coverage geometry is empty (can happen after ST_Difference)
    IF platform_coverage_geom IS NOT NULL AND ST_IsEmpty(platform_coverage_geom) THEN
      platform_coverage_geom := NULL;
      RAISE NOTICE 'Platform coverage geometry is empty after exclusions';
    END IF;
    
    RAISE NOTICE 'Platform coverage computed: % (% active platforms)', 
      CASE WHEN platform_coverage_geom IS NOT NULL THEN 'geometry exists' ELSE 'NULL/empty' END,
      active_platform_count;
  END IF;

  RETURN QUERY
  WITH 
    -- Get all visible/featured church IDs
    visible_churches AS (
      SELECT DISTINCT church_id
      FROM city_platform_churches
      WHERE status IN ('visible', 'featured')
    ),
    -- Get all churches that have ever been linked to a platform (any status)
    linked_churches AS (
      SELECT DISTINCT church_id
      FROM city_platform_churches
    )
  SELECT 
    c.id,
    c.name,
    c.city,
    c.state,
    ST_X(c.location::geometry) as lng,
    ST_Y(c.location::geometry) as lat
  FROM churches c
  LEFT JOIN visible_churches vc ON c.id = vc.church_id
  LEFT JOIN linked_churches lc ON c.id = lc.church_id
  WHERE 
    c.location IS NOT NULL
    -- Exclude superseded churches
    AND c.superseded_by_church_id IS NULL
    AND (
      -- CASE 1: Visible/featured on a platform → INCLUDE
      vc.church_id IS NOT NULL
      OR
      -- CASE 2: Never linked to any platform (bulk import)
      (
        lc.church_id IS NULL
        AND (c.managed_by_platform IS NULL OR c.managed_by_platform = false)
        -- Only include if OUTSIDE all platform boundaries (or no coverage exists)
        AND (
          platform_coverage_geom IS NULL  -- No coverage (no platforms or empty geometry)
          OR NOT ST_Intersects(c.location::geometry, platform_coverage_geom)
        )
      )
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant access
GRANT EXECUTE ON FUNCTION fn_tileset_churches() TO anon, authenticated, service_role;

COMMENT ON FUNCTION fn_tileset_churches() IS 
'Returns all churches for tileset generation:
- Visible/featured platform churches
- Bulk imports outside platform boundaries
Excludes: hidden churches, superseded churches, bulk imports inside platform areas

Computes platform coverage directly from city_platform_boundaries + boundaries tables
to ensure coverage is always current when platforms change boundaries.
Excluded boundaries are subtracted from the coverage area.

Edge cases handled:
- No active platforms: all bulk imports included
- Active platforms with no included boundaries: all bulk imports included  
- Empty geometry after exclusions: all bulk imports included';
