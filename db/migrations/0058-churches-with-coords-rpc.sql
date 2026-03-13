-- Function to get churches within a bounding box WITH extracted lat/lng coordinates
-- This enables distance-based filtering for prayer suggestions
CREATE OR REPLACE FUNCTION fn_get_churches_with_coords_in_bbox(
  west float8,
  south float8,
  east float8,
  north float8
)
RETURNS TABLE (
  id uuid,
  name text,
  city text,
  latitude float8,
  longitude float8
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
    c.city,
    ST_Y(c.location::geometry) as latitude,
    ST_X(c.location::geometry) as longitude
  FROM churches c
  WHERE c.location IS NOT NULL
    AND ST_Intersects(
      c.location::geometry,
      ST_SetSRID(ST_MakeEnvelope(west, south, east, north), 4326)
    );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_get_churches_with_coords_in_bbox(float8, float8, float8, float8) TO authenticated, service_role, supabase_auth_admin, anon;
