-- Migration: Add boundary_ids to fn_get_churches output
-- Fix: Include boundary_ids so backend can fetch boundary geometries

DROP FUNCTION IF EXISTS fn_get_churches(TEXT, TEXT, TEXT[], TEXT[]);

CREATE OR REPLACE FUNCTION fn_get_churches(
  search_term TEXT DEFAULT NULL,
  denomination_filter TEXT DEFAULT NULL,
  collab_have_filter TEXT[] DEFAULT NULL,
  collab_need_filter TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  denomination TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  website TEXT,
  email TEXT,
  phone TEXT,
  description TEXT,
  approved BOOLEAN,
  collaboration_have TEXT[],
  collaboration_need TEXT[],
  boundary_ids UUID[],
  created_at TIMESTAMPTZ,
  location JSON
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.denomination,
    c.address,
    c.city,
    c.state,
    c.zip,
    c.website,
    c.email,
    c.phone,
    c.description,
    c.approved,
    c.collaboration_have,
    c.collaboration_need,
    c.boundary_ids,
    c.created_at,
    ST_AsGeoJSON(c.location)::json as location
  FROM public.churches c
  WHERE c.approved = true
    AND (search_term IS NULL OR c.name ILIKE '%' || search_term || '%')
    AND (denomination_filter IS NULL OR c.denomination = denomination_filter)
    AND (collab_have_filter IS NULL OR c.collaboration_have && collab_have_filter)
    AND (collab_need_filter IS NULL OR c.collaboration_need && collab_need_filter)
  ORDER BY c.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION fn_get_churches TO anon, authenticated;

COMMENT ON FUNCTION fn_get_churches IS 'Returns approved churches with location as GeoJSON and boundary_ids, optionally filtered by search term, denomination, and collaboration tags';
