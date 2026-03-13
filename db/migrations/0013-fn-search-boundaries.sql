-- RPC function to search boundaries by name and optionally by type
-- Returns up to 50 results to avoid overloading the UI
-- Uses ILIKE for case-insensitive partial matching

CREATE OR REPLACE FUNCTION public.fn_search_boundaries(
  q text, 
  boundary_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  external_id text,
  name text,
  type text,
  geometry geography,
  source text,
  created_at timestamptz
)
LANGUAGE sql STABLE AS $$
  SELECT 
    id,
    external_id,
    name,
    type,
    geometry,
    source,
    created_at
  FROM public.boundaries
  WHERE (boundary_type IS NULL OR type = boundary_type)
    AND name ILIKE ('%' || q || '%')
  ORDER BY name ASC
  LIMIT 50;
$$;
