-- RPC function to get areas with GeoJSON geometry
CREATE OR REPLACE FUNCTION public.get_areas()
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  church_id uuid,
  geometry json,
  created_by uuid,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.name,
    a.type,
    a.church_id,
    ST_AsGeoJSON(a.geometry)::json as geometry,
    a.created_by,
    a.created_at
  FROM public.areas a
  ORDER BY a.created_at DESC;
END;
$$ LANGUAGE plpgsql;
