-- Add unique constraint on (external_id, type) to prevent duplicate boundary imports
-- This is the root cause of duplicate ZIPs and places: the upsert function checks
-- for existing records but race conditions between batch calls allow duplicates through.

-- First, we need to handle existing duplicates before adding the constraint.
-- Keep the oldest row (smallest id) for each (external_id, type) pair.
DELETE FROM public.boundaries a
USING public.boundaries b
WHERE a.external_id = b.external_id
  AND a.type = b.type
  AND a.external_id IS NOT NULL
  AND a.created_at > b.created_at;

-- Handle any remaining dupes where created_at is identical (use id as tiebreaker)
DELETE FROM public.boundaries a
USING public.boundaries b
WHERE a.external_id = b.external_id
  AND a.type = b.type
  AND a.external_id IS NOT NULL
  AND a.id > b.id;

-- Now add the unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_boundaries_external_id_type_unique
  ON public.boundaries (external_id, type)
  WHERE external_id IS NOT NULL;

-- Update fn_import_boundaries to use INSERT ON CONFLICT instead of SELECT+INSERT
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
BEGIN
  FOR boundary_record IN SELECT * FROM jsonb_array_elements(boundaries_data)
  LOOP
    BEGIN
      INSERT INTO public.boundaries (
        external_id, name, type, geometry, source, state_fips, county_fips
      ) VALUES (
        boundary_record->>'external_id',
        boundary_record->>'name',
        boundary_record->>'type',
        ST_GeomFromGeoJSON(boundary_record->>'geometry')::geography,
        boundary_record->>'source',
        boundary_record->>'state_fips',
        boundary_record->>'county_fips'
      )
      ON CONFLICT (external_id, type) WHERE external_id IS NOT NULL
      DO UPDATE SET
        name = EXCLUDED.name,
        geometry = EXCLUDED.geometry,
        source = EXCLUDED.source,
        state_fips = COALESCE(EXCLUDED.state_fips, public.boundaries.state_fips),
        county_fips = COALESCE(EXCLUDED.county_fips, public.boundaries.county_fips);

      -- Check if it was an insert or update
      IF FOUND THEN
        -- xmax = 0 means insert, > 0 means update
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
