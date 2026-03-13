-- Update fn_import_boundaries to support state_fips, county_fips and upsert behavior
DROP FUNCTION IF EXISTS public.fn_import_boundaries(jsonb);

CREATE OR REPLACE FUNCTION public.fn_import_boundaries(
  boundaries_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  boundary_record jsonb;
  inserted_count integer := 0;
  updated_count integer := 0;
  error_count integer := 0;
  existing_id uuid;
BEGIN
  FOR boundary_record IN SELECT * FROM jsonb_array_elements(boundaries_data)
  LOOP
    BEGIN
      -- Check if boundary already exists by external_id and type
      SELECT id INTO existing_id
      FROM public.boundaries
      WHERE external_id = boundary_record->>'external_id'
        AND type = boundary_record->>'type';
      
      IF existing_id IS NOT NULL THEN
        -- Update existing boundary
        UPDATE public.boundaries SET
          name = boundary_record->>'name',
          geometry = ST_GeomFromGeoJSON(boundary_record->>'geometry')::geography,
          source = boundary_record->>'source',
          state_fips = boundary_record->>'state_fips',
          county_fips = boundary_record->>'county_fips'
        WHERE id = existing_id;
        
        updated_count := updated_count + 1;
      ELSE
        -- Insert new boundary
        INSERT INTO public.boundaries (
          external_id,
          name,
          type,
          geometry,
          source,
          state_fips,
          county_fips
        ) VALUES (
          boundary_record->>'external_id',
          boundary_record->>'name',
          boundary_record->>'type',
          ST_GeomFromGeoJSON(boundary_record->>'geometry')::geography,
          boundary_record->>'source',
          boundary_record->>'state_fips',
          boundary_record->>'county_fips'
        );
        
        inserted_count := inserted_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      error_count := error_count + 1;
      RAISE NOTICE 'Error importing boundary %: %', boundary_record->>'name', SQLERRM;
    END;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'inserted', inserted_count,
    'updated', updated_count,
    'errors', error_count
  );
END;
$$;
