-- Function to export churches for tileset generation
-- Returns id, name, city, state, lng, lat for all churches with valid coordinates

CREATE OR REPLACE FUNCTION fn_export_churches_for_tileset()
RETURNS TABLE (
  id UUID,
  name TEXT,
  city TEXT,
  state TEXT,
  lng DOUBLE PRECISION,
  lat DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.city,
    c.state,
    ST_X(c.location::geometry) as lng,
    ST_Y(c.location::geometry) as lat
  FROM churches c
  WHERE c.location IS NOT NULL
    AND c.approved = true;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION fn_export_churches_for_tileset() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_export_churches_for_tileset() TO service_role;
