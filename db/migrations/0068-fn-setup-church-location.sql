-- Migration: Create function to set county_fips and boundary_ids for a single church
-- Called after creating/updating a church to ensure proper geographic linking

CREATE OR REPLACE FUNCTION fn_setup_church_location(church_id uuid)
RETURNS jsonb AS $$
DECLARE
  church_loc geography;
  found_county_fips text;
  found_boundary_ids uuid[];
BEGIN
  -- Get the church's location
  SELECT location INTO church_loc
  FROM churches
  WHERE id = church_id;
  
  IF church_loc IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Church has no location');
  END IF;
  
  -- Find county_fips from census tract
  SELECT LEFT(b.external_id, 5) INTO found_county_fips
  FROM boundaries b
  WHERE b.type = 'census_tract'
    AND ST_Covers(b.geometry, church_loc)
  LIMIT 1;
  
  -- Find all containing boundaries
  SELECT ARRAY_AGG(b.id) INTO found_boundary_ids
  FROM boundaries b
  WHERE ST_Covers(b.geometry, church_loc);
  
  -- Update the church
  UPDATE churches
  SET 
    county_fips = found_county_fips,
    boundary_ids = COALESCE(found_boundary_ids, '{}')
  WHERE id = church_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'county_fips', found_county_fips,
    'boundary_count', COALESCE(array_length(found_boundary_ids, 1), 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users (needed for church creation)
GRANT EXECUTE ON FUNCTION fn_setup_church_location(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_setup_church_location(uuid) TO anon;
