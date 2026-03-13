-- RPC function to create area with PostGIS geography
CREATE OR REPLACE FUNCTION public.create_area(
  p_name text,
  p_type text,
  p_church_id uuid,
  p_geometry_geojson text
)
RETURNS json AS $$
DECLARE
  v_area_id uuid;
  v_result json;
BEGIN
  -- Insert area with geography converted from GeoJSON with SRID 4326
  INSERT INTO public.areas (name, type, church_id, geometry)
  VALUES (
    p_name,
    p_type,
    p_church_id,
    ST_SetSRID(ST_GeomFromGeoJSON(p_geometry_geojson), 4326)::geography
  )
  RETURNING areas.id INTO v_area_id;

  -- Return the created area with GeoJSON geometry as a single JSON object
  SELECT json_build_object(
    'id', a.id,
    'name', a.name,
    'type', a.type,
    'church_id', a.church_id,
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
