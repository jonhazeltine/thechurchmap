-- Update create_area function to accept and save calling_id
DROP FUNCTION IF EXISTS public.create_area(text, text, uuid, text);

CREATE OR REPLACE FUNCTION public.create_area(
  p_name text,
  p_type text,
  p_church_id uuid,
  p_geometry_geojson text,
  p_calling_id uuid DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_area_id uuid;
  v_result json;
BEGIN
  -- Insert area with geography converted from GeoJSON with SRID 4326
  INSERT INTO public.areas (name, type, church_id, geometry, calling_id)
  VALUES (
    p_name,
    p_type,
    p_church_id,
    ST_SetSRID(ST_GeomFromGeoJSON(p_geometry_geojson), 4326)::geography,
    p_calling_id
  )
  RETURNING areas.id INTO v_area_id;

  -- Return the created area with GeoJSON geometry as a single JSON object
  SELECT json_build_object(
    'id', a.id,
    'name', a.name,
    'type', a.type,
    'church_id', a.church_id,
    'calling_id', a.calling_id,
    'geometry', ST_AsGeoJSON(a.geometry)::json,
    'created_by', a.created_by,
    'created_at', a.created_at
  )
  INTO v_result
  FROM public.areas a
  WHERE a.id = v_area_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Update get_areas function to return calling_id
CREATE OR REPLACE FUNCTION public.get_areas()
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  church_id uuid,
  calling_id uuid,
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
    a.calling_id,
    ST_AsGeoJSON(a.geometry)::json as geometry,
    a.created_by,
    a.created_at
  FROM public.areas a
  ORDER BY a.created_at DESC;
END;
$$ LANGUAGE plpgsql;
