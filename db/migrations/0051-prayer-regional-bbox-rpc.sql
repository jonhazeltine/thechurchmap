-- Function to get boundary external_ids within a bounding box
-- This is used for filtering regional prayers by viewport
CREATE OR REPLACE FUNCTION fn_get_boundaries_in_bbox(
  west float8,
  south float8,
  east float8,
  north float8
)
RETURNS TABLE (
  id uuid,
  external_id text,
  name text,
  type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.external_id,
    b.name,
    b.type
  FROM boundaries b
  WHERE b.geometry IS NOT NULL
    AND ST_Intersects(
      b.geometry::geometry,
      ST_SetSRID(ST_MakeEnvelope(west, south, east, north), 4326)
    );
END;
$$;

-- Function to get area ids within a bounding box
-- This is used for filtering regional prayers by viewport
CREATE OR REPLACE FUNCTION fn_get_areas_in_bbox(
  west float8,
  south float8,
  east float8,
  north float8
)
RETURNS TABLE (
  id uuid,
  name text,
  type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.name,
    a.type
  FROM areas a
  WHERE a.geometry IS NOT NULL
    AND ST_Intersects(
      a.geometry::geometry,
      ST_SetSRID(ST_MakeEnvelope(west, south, east, north), 4326)
    );
END;
$$;

-- Grant execute permissions (only needed in production with Supabase Auth)
-- GRANT EXECUTE ON FUNCTION fn_get_boundaries_in_bbox(float8, float8, float8, float8) TO authenticated, service_role, supabase_auth_admin;
-- GRANT EXECUTE ON FUNCTION fn_get_areas_in_bbox(float8, float8, float8, float8) TO authenticated, service_role, supabase_auth_admin;
