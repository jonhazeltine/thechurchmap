-- Function to count churches per boundary using the pre-linked boundary_ids array
-- This is efficient because it uses SQL aggregation instead of client-side counting

CREATE OR REPLACE FUNCTION fn_count_churches_by_boundaries(boundary_id_list uuid[])
RETURNS TABLE (boundary_id uuid, church_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    unnest.boundary_id,
    COUNT(DISTINCT c.id) as church_count
  FROM public.churches c
  CROSS JOIN LATERAL unnest(c.boundary_ids::uuid[]) AS unnest(boundary_id)
  WHERE c.approved = true
    AND unnest.boundary_id = ANY(boundary_id_list)
  GROUP BY unnest.boundary_id;
$$;

COMMENT ON FUNCTION fn_count_churches_by_boundaries IS 
  'Counts churches linked to each boundary in the given list. Uses the pre-linked boundary_ids array for efficiency.';
