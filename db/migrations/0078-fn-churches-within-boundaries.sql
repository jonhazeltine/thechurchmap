-- =====================================================================
-- CHURCHES WITHIN BOUNDARIES RPC FUNCTION
-- =====================================================================
-- Migration 0078: Find churches within specified geographic boundaries
-- 
-- This function is used when auto-linking churches to a city platform
-- after platform application approval. It finds all churches whose
-- location falls within any of the specified boundary polygons.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_churches_within_boundaries(
  p_boundary_ids UUID[]
)
RETURNS TABLE (
  church_id UUID,
  church_name TEXT,
  city TEXT,
  state TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    c.id AS church_id,
    c.name AS church_name,
    c.city,
    c.state
  FROM public.churches c
  INNER JOIN public.boundaries b ON b.id = ANY(p_boundary_ids)
  WHERE c.location IS NOT NULL
    AND c.approved = true
    AND ST_Intersects(c.location, b.geometry);
END;
$$;

COMMENT ON FUNCTION public.fn_churches_within_boundaries IS 
  'Finds all approved churches whose location falls within any of the specified geographic boundaries. Used for auto-linking churches to platforms.';
