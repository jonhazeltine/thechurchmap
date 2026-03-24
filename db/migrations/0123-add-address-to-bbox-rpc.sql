-- Add address, state, and denomination fields to the bbox church lookup RPC
-- so the journey builder church picker can display full church details
-- NOTE: Must DROP first because RETURNS TABLE signature is changing

DROP FUNCTION IF EXISTS fn_get_churches_with_coords_in_bbox(float8, float8, float8, float8);

CREATE FUNCTION fn_get_churches_with_coords_in_bbox(
  west float8,
  south float8,
  east float8,
  north float8
)
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  city text,
  state text,
  denomination text,
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
    c.address,
    c.city,
    c.state,
    c.denomination,
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

GRANT EXECUTE ON FUNCTION fn_get_churches_with_coords_in_bbox(float8, float8, float8, float8) TO authenticated, service_role, supabase_auth_admin;
