-- RPC function to bulk import boundaries
-- Accepts array of boundary objects with GeoJSON geometry
-- Converts GeoJSON to PostGIS geography type

CREATE OR REPLACE FUNCTION public.fn_import_boundaries(
  boundaries_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  boundary_record jsonb;
  inserted_count integer := 0;
  error_count integer := 0;
BEGIN
  FOR boundary_record IN SELECT * FROM jsonb_array_elements(boundaries_data)
  LOOP
    BEGIN
      INSERT INTO public.boundaries (
        external_id,
        name,
        type,
        geometry,
        source
      ) VALUES (
        boundary_record->>'external_id',
        boundary_record->>'name',
        boundary_record->>'type',
        ST_GeomFromGeoJSON(boundary_record->>'geometry')::geography,
        boundary_record->>'source'
      );
      
      inserted_count := inserted_count + 1;
    EXCEPTION WHEN OTHERS THEN
      error_count := error_count + 1;
    END;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'inserted', inserted_count,
    'errors', error_count
  );
END;
$$;
