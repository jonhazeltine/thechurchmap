-- Fix fn_get_boundaries_by_ids to properly handle UUID comparisons
-- The boundaries table has UUID ids, but the function receives text[] from JavaScript

DROP FUNCTION IF EXISTS fn_get_boundaries_by_ids(text[]);

CREATE OR REPLACE FUNCTION fn_get_boundaries_by_ids(boundary_ids text[])
RETURNS TABLE (
  id text,
  name text,
  type text,
  geometry jsonb
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id::text,
    b.name,
    b.type,
    ST_AsGeoJSON(b.geometry)::jsonb as geometry
  FROM boundaries b
  WHERE b.id::text = ANY(boundary_ids);
END;
$$;
