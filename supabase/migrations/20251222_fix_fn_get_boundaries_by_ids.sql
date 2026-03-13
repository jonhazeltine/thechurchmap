-- Drop the conflicting function versions
DROP FUNCTION IF EXISTS fn_get_boundaries_by_ids(uuid[]);
DROP FUNCTION IF EXISTS fn_get_boundaries_by_ids(text[]);

-- Create new function that accepts text[] and casts to UUID internally
-- This matches what the API sends (string IDs from query params)
CREATE OR REPLACE FUNCTION fn_get_boundaries_by_ids(boundary_ids text[])
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  external_id text,
  geometry json
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.type,
    b.external_id,
    ST_AsGeoJSON(b.geometry)::json as geometry
  FROM boundaries b
  WHERE b.id = ANY(boundary_ids::uuid[])
    AND b.geometry IS NOT NULL;
END;
$$;

-- Grant execute permission to authenticated and anonymous users
GRANT EXECUTE ON FUNCTION fn_get_boundaries_by_ids(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_get_boundaries_by_ids(text[]) TO anon;
