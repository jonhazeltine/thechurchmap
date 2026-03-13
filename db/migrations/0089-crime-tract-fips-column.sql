-- Add tract_fips column to crime_incidents for efficient aggregation
-- Run in Supabase SQL Editor

-- Add the column
ALTER TABLE crime_incidents ADD COLUMN IF NOT EXISTS tract_fips TEXT;

-- Create index for aggregation
CREATE INDEX IF NOT EXISTS idx_crime_incidents_tract_fips ON crime_incidents(tract_fips);

-- Function to assign tract FIPS to crime incidents in batches
-- This finds which census tract each incident falls within
CREATE OR REPLACE FUNCTION fn_assign_crime_tracts(
  p_city TEXT,
  p_state TEXT,
  p_batch_size INTEGER DEFAULT 10000
)
RETURNS TABLE (
  updated_count INTEGER,
  remaining_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER;
  v_remaining INTEGER;
BEGIN
  -- Update a batch of incidents that don't have tract_fips assigned
  WITH incidents_to_update AS (
    SELECT ci.id, b.external_id as tract_fips
    FROM crime_incidents ci
    CROSS JOIN LATERAL (
      SELECT external_id 
      FROM boundaries 
      WHERE type = 'census_tract'
        AND ST_Contains(geometry::geometry, ci.location::geometry)
      LIMIT 1
    ) b
    WHERE ci.city = p_city 
      AND ci.state = p_state
      AND ci.tract_fips IS NULL
      AND ci.location IS NOT NULL
    LIMIT p_batch_size
  )
  UPDATE crime_incidents ci
  SET tract_fips = itu.tract_fips
  FROM incidents_to_update itu
  WHERE ci.id = itu.id;
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  
  -- Count remaining
  SELECT COUNT(*) INTO v_remaining
  FROM crime_incidents
  WHERE city = p_city AND state = p_state AND tract_fips IS NULL AND location IS NOT NULL;
  
  RETURN QUERY SELECT v_updated, v_remaining;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_assign_crime_tracts TO authenticated;
GRANT EXECUTE ON FUNCTION fn_assign_crime_tracts TO anon;
