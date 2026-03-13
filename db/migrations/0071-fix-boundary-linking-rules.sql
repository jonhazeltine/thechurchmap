-- =====================================================================
-- FIX BOUNDARY LINKING RULES
-- =====================================================================
-- Migration 0071: Update fn_get_boundaries_for_church to ONLY return places
-- 
-- Problem: The function was returning both 'place' and 'county subdivision'
-- boundaries, causing duplicate entries on churches.
--
-- Solution: Only return 'place' boundaries for church linking.
--
-- Rationale:
-- - 'place' is the official Census Bureau designation for cities/villages/CDPs
-- - 'county subdivision' often duplicates 'place' (e.g., "Wyoming city" vs "Wyoming")
-- - 'census_tract' is too granular - only used for health metrics overlay
-- =====================================================================

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
  WHERE b.type = 'place'  -- ONLY places, not county subdivisions
    AND b.geometry IS NOT NULL
    AND ST_Covers(
      b.geometry,
      ST_SetSRID(ST_MakePoint(church_lon, church_lat), 4326)::geography
    )
  ORDER BY area DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================================
-- COMMENTS
-- =====================================================================
COMMENT ON FUNCTION fn_get_boundaries_for_church IS 
'Finds place boundaries containing a church location. 
Returns only "place" type boundaries (cities, villages, CDPs).
Does NOT return: census_tract (too granular), county_subdivision (duplicates places).
See docs/DATA_INGESTION_GUIDE.md for full data ingestion rules.';
