-- Assign tract FIPS to Dallas crime incidents with extended timeout
-- Run in Supabase SQL Editor

-- Set a longer timeout for this session (10 minutes)
SET statement_timeout = '10min';

-- Assign tract FIPS to all Dallas incidents in one go
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
  WHERE ci.city = 'Dallas' 
    AND ci.state = 'TX'
    AND ci.tract_fips IS NULL
    AND ci.location IS NOT NULL
)
UPDATE crime_incidents ci
SET tract_fips = itu.tract_fips
FROM incidents_to_update itu
WHERE ci.id = itu.id;

-- Check results
SELECT 
  COUNT(*) FILTER (WHERE tract_fips IS NOT NULL) as with_tract,
  COUNT(*) FILTER (WHERE tract_fips IS NULL AND location IS NOT NULL) as without_tract,
  COUNT(*) as total
FROM crime_incidents
WHERE city = 'Dallas' AND state = 'TX';
