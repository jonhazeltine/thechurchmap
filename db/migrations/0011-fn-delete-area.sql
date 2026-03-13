-- RPC function to delete area
CREATE OR REPLACE FUNCTION public.delete_area(p_area_id uuid)
RETURNS void AS $$
BEGIN
  DELETE FROM public.areas
  WHERE id = p_area_id;
END;
$$ LANGUAGE plpgsql;
