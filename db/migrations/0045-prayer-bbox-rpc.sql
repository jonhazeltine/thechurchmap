-- Function to get churches within a bounding box
CREATE OR REPLACE FUNCTION fn_get_churches_in_bbox(
  west float8,
  south float8,
  east float8,
  north float8
)
RETURNS TABLE (
  id uuid,
  name text,
  location geography
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
    c.location
  FROM churches c
  WHERE c.location IS NOT NULL
    AND ST_Intersects(
      c.location::geometry,
      ST_SetSRID(ST_MakeEnvelope(west, south, east, north), 4326)
    );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_get_churches_in_bbox(float8, float8, float8, float8) TO authenticated, service_role, supabase_auth_admin;
