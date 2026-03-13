-- RPC function to update area geometry
CREATE OR REPLACE FUNCTION public.update_area_geometry(
  p_area_id uuid,
  p_geometry jsonb
)
RETURNS void AS $$
BEGIN
  UPDATE public.areas
  SET geometry = ST_SetSRID(ST_GeomFromGeoJSON(p_geometry::text), 4326)::geography
  WHERE id = p_area_id;
END;
$$ LANGUAGE plpgsql;
