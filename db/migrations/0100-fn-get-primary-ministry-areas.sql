-- =====================================================================
-- PRIMARY MINISTRY AREAS RPC FUNCTION
-- =====================================================================
-- Migration 0100: Lightweight RPC for fetching churches with primary ministry areas
-- 
-- This function returns ONLY churches that have a primary_ministry_area set,
-- with the geography converted to GeoJSON. It's optimized to avoid the large
-- payloads that cause header overflow errors.
--
-- Features:
-- - Optional platform filtering via p_platform_id
-- - Optional church ID filtering via p_church_ids array
-- - Lightweight return shape (only needed fields)
-- - Proper ST_AsGeoJSON conversion for frontend consumption
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_get_primary_ministry_areas(
  p_platform_id UUID DEFAULT NULL,
  p_church_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  created_at timestamptz,
  primary_ministry_area jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.created_at,
    ST_AsGeoJSON(c.primary_ministry_area)::jsonb as primary_ministry_area
  FROM public.churches c
  LEFT JOIN public.city_platform_churches cpc 
    ON c.id = cpc.church_id 
    AND cpc.status IN ('visible', 'featured')
  WHERE 
    c.approved = true
    AND c.primary_ministry_area IS NOT NULL
    -- Platform filter: if provided, only include churches in that platform
    AND (
      p_platform_id IS NULL 
      OR cpc.city_platform_id = p_platform_id
    )
    -- Church IDs filter: if provided, only include those churches
    AND (
      p_church_ids IS NULL 
      OR c.id = ANY(p_church_ids)
    )
  ORDER BY c.name;
END;
$$;

-- Grant execute permission to all roles
GRANT EXECUTE ON FUNCTION fn_get_primary_ministry_areas(uuid, uuid[]) TO authenticated, anon, service_role;

COMMENT ON FUNCTION fn_get_primary_ministry_areas IS 
  'Returns churches with primary ministry areas as GeoJSON. Optimized lightweight response for Ministry Map panel. Supports optional platform and church ID filtering.';
