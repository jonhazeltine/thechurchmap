-- Add is_primary column to areas table
ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

-- Ensure only one primary area per church
CREATE UNIQUE INDEX IF NOT EXISTS idx_areas_one_primary_per_church ON public.areas(church_id) WHERE is_primary = true;

-- Update get_areas function to return is_primary
CREATE OR REPLACE FUNCTION public.get_areas()
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  church_id uuid,
  calling_id uuid,
  geometry json,
  created_by uuid,
  created_at timestamptz,
  is_primary boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.name,
    a.type,
    a.church_id,
    a.calling_id,
    ST_AsGeoJSON(a.geometry)::json as geometry,
    a.created_by,
    a.created_at,
    a.is_primary
  FROM public.areas a
  ORDER BY a.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Update create_area function to accept is_primary parameter
DROP FUNCTION IF EXISTS public.create_area(text, text, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.create_area(
  p_name text,
  p_type text,
  p_church_id uuid,
  p_geometry_geojson text,
  p_calling_id uuid DEFAULT NULL,
  p_is_primary boolean DEFAULT false
)
RETURNS json AS $$
DECLARE
  v_area_id uuid;
  v_result json;
BEGIN
  -- If setting as primary, unset any existing primary for this church
  IF p_is_primary AND p_church_id IS NOT NULL THEN
    UPDATE public.areas SET is_primary = false WHERE church_id = p_church_id AND is_primary = true;
  END IF;

  INSERT INTO public.areas (name, type, church_id, geometry, calling_id, is_primary)
  VALUES (
    p_name,
    p_type,
    p_church_id,
    ST_SetSRID(ST_GeomFromGeoJSON(p_geometry_geojson), 4326)::geography,
    p_calling_id,
    p_is_primary
  )
  RETURNING areas.id INTO v_area_id;

  SELECT json_build_object(
    'id', a.id,
    'name', a.name,
    'type', a.type,
    'church_id', a.church_id,
    'calling_id', a.calling_id,
    'geometry', ST_AsGeoJSON(a.geometry)::json,
    'created_by', a.created_by,
    'created_at', a.created_at,
    'is_primary', a.is_primary
  )
  INTO v_result
  FROM public.areas a
  WHERE a.id = v_area_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
