-- Migration 0007: Function to get churches with GeoJSON location
-- This function properly converts PostGIS geography to GeoJSON for the frontend

-- Drop the old function first (if it exists)
DROP FUNCTION IF EXISTS fn_get_churches(TEXT, TEXT);

CREATE OR REPLACE FUNCTION fn_get_churches(
  search_term TEXT DEFAULT NULL,
  denomination_filter TEXT DEFAULT NULL
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
    c.created_at,
    ST_AsGeoJSON(c.location)::json as location
  FROM public.churches c
  WHERE c.approved = true
    AND (search_term IS NULL OR c.name ILIKE '%' || search_term || '%')
    AND (denomination_filter IS NULL OR c.denomination = denomination_filter)
  ORDER BY c.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION fn_get_churches TO anon, authenticated;

COMMENT ON FUNCTION fn_get_churches IS 'Returns approved churches with location as GeoJSON, optionally filtered by search term and denomination';
