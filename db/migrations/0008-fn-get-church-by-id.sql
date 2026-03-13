-- Migration 0008: Function to get a single church by ID with GeoJSON location
-- This function properly converts PostGIS geography to GeoJSON for the frontend

-- Drop the old function first (if it exists)
DROP FUNCTION IF EXISTS fn_get_church_by_id(UUID);

CREATE OR REPLACE FUNCTION fn_get_church_by_id(church_id UUID)
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
  WHERE c.id = church_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION fn_get_church_by_id TO anon, authenticated;

COMMENT ON FUNCTION fn_get_church_by_id IS 'Returns a single church by ID with location as GeoJSON';
