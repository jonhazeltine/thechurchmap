-- Crime Tract Assignment Pipeline
-- Scalable solution for assigning census tract FIPS to crime incidents
-- Run in Supabase SQL Editor

-- ============================================================================
-- STEP 1: Create optimized indexes for spatial joins
-- ============================================================================

-- Partial GiST index on boundaries for census tracts only (much faster)
CREATE INDEX IF NOT EXISTS idx_boundaries_census_tract_gist 
ON boundaries USING GIST (geometry) 
WHERE type = 'census_tract';

-- Composite index for filtering crime incidents
CREATE INDEX IF NOT EXISTS idx_crime_incidents_city_state_tract 
ON crime_incidents(city, state, tract_fips);

-- GiST index on crime_incidents location already exists from 0086

-- Run ANALYZE to update statistics
ANALYZE boundaries;
ANALYZE crime_incidents;

-- ============================================================================
-- STEP 2: Create queue table for pending tract assignments
-- ============================================================================

CREATE TABLE IF NOT EXISTS crime_tract_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crime_incident_id UUID NOT NULL REFERENCES crime_incidents(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  UNIQUE(crime_incident_id)
);

CREATE INDEX IF NOT EXISTS idx_crime_tract_queue_status ON crime_tract_queue(status);
CREATE INDEX IF NOT EXISTS idx_crime_tract_queue_city_state ON crime_tract_queue(city, state);

-- ============================================================================
-- STEP 3: Optimized batch assignment function (uses spatial index properly)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_assign_crime_tracts_optimized(
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_batch_size INTEGER DEFAULT 10000
)
RETURNS TABLE (
  updated_count INTEGER,
  remaining_count INTEGER,
  elapsed_ms INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INTEGER;
  v_remaining INTEGER;
  v_start TIMESTAMPTZ;
BEGIN
  v_start := clock_timestamp();
  
  -- Update a batch of incidents using optimized spatial join
  -- Uses && (bounding box) for index filter, then ST_Covers for exact match
  WITH batch AS (
    SELECT id 
    FROM crime_incidents 
    WHERE (p_city IS NULL OR city = p_city)
      AND (p_state IS NULL OR state = p_state)
      AND tract_fips IS NULL 
      AND location IS NOT NULL
    LIMIT p_batch_size
  ),
  matched AS (
    SELECT DISTINCT ON (ci.id)
      ci.id as incident_id,
      b.external_id as tract_fips
    FROM crime_incidents ci
    JOIN batch ON ci.id = batch.id
    JOIN boundaries b ON 
      b.type = 'census_tract'
      AND b.geometry && ci.location::geometry  -- Use bounding box index
      AND ST_Covers(b.geometry::geometry, ci.location::geometry)  -- Exact match
    ORDER BY ci.id
  )
  UPDATE crime_incidents ci
  SET tract_fips = matched.tract_fips
  FROM matched
  WHERE ci.id = matched.incident_id;
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  
  -- Count remaining
  SELECT COUNT(*) INTO v_remaining
  FROM crime_incidents
  WHERE (p_city IS NULL OR city = p_city)
    AND (p_state IS NULL OR state = p_state)
    AND tract_fips IS NULL 
    AND location IS NOT NULL;
  
  RETURN QUERY SELECT 
    v_updated, 
    v_remaining, 
    EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start)::INTEGER;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_assign_crime_tracts_optimized TO authenticated;
GRANT EXECUTE ON FUNCTION fn_assign_crime_tracts_optimized TO anon;

-- ============================================================================
-- STEP 4: Queue processor function (processes pending queue items)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_process_crime_tract_queue(
  p_batch_size INTEGER DEFAULT 5000
)
RETURNS TABLE (
  processed_count INTEGER,
  remaining_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_remaining INTEGER;
BEGIN
  -- Mark batch as processing
  UPDATE crime_tract_queue
  SET status = 'processing', attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM crime_tract_queue 
    WHERE status = 'pending' 
    LIMIT p_batch_size
  );
  
  -- Assign tracts using optimized spatial join
  WITH queue_batch AS (
    SELECT q.id as queue_id, q.crime_incident_id
    FROM crime_tract_queue q
    WHERE q.status = 'processing'
  ),
  matched AS (
    SELECT DISTINCT ON (ci.id)
      qb.queue_id,
      ci.id as incident_id,
      b.external_id as tract_fips
    FROM crime_incidents ci
    JOIN queue_batch qb ON ci.id = qb.crime_incident_id
    JOIN boundaries b ON 
      b.type = 'census_tract'
      AND b.geometry && ci.location::geometry
      AND ST_Covers(b.geometry::geometry, ci.location::geometry)
    WHERE ci.location IS NOT NULL
    ORDER BY ci.id
  )
  UPDATE crime_incidents ci
  SET tract_fips = matched.tract_fips
  FROM matched
  WHERE ci.id = matched.incident_id;
  
  GET DIAGNOSTICS v_processed = ROW_COUNT;
  
  -- Mark processed queue items as completed
  UPDATE crime_tract_queue
  SET status = 'completed', processed_at = NOW()
  WHERE status = 'processing'
    AND crime_incident_id IN (
      SELECT id FROM crime_incidents WHERE tract_fips IS NOT NULL
    );
  
  -- Mark unmatched items (no tract found) as failed
  UPDATE crime_tract_queue
  SET status = 'failed', 
      processed_at = NOW(),
      error_message = 'No matching census tract found'
  WHERE status = 'processing';
  
  -- Count remaining
  SELECT COUNT(*) INTO v_remaining
  FROM crime_tract_queue WHERE status = 'pending';
  
  RETURN QUERY SELECT v_processed, v_remaining;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_process_crime_tract_queue TO authenticated;

-- ============================================================================
-- STEP 5: Trigger to auto-queue new crime incidents
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_queue_crime_tract_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- Only queue if the incident has a location but no tract_fips
  IF NEW.location IS NOT NULL AND NEW.tract_fips IS NULL THEN
    INSERT INTO crime_tract_queue (crime_incident_id, city, state)
    VALUES (NEW.id, NEW.city, NEW.state)
    ON CONFLICT (crime_incident_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_queue_crime_tract ON crime_incidents;
CREATE TRIGGER trigger_queue_crime_tract
  AFTER INSERT ON crime_incidents
  FOR EACH ROW
  EXECUTE FUNCTION fn_queue_crime_tract_assignment();

-- ============================================================================
-- STEP 6: Backfill function to queue existing unassigned incidents
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_backfill_crime_tract_queue(
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL,
  p_batch_size INTEGER DEFAULT 50000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inserted INTEGER;
BEGIN
  INSERT INTO crime_tract_queue (crime_incident_id, city, state)
  SELECT id, city, state
  FROM crime_incidents
  WHERE tract_fips IS NULL
    AND location IS NOT NULL
    AND (p_city IS NULL OR city = p_city)
    AND (p_state IS NULL OR state = p_state)
  LIMIT p_batch_size
  ON CONFLICT (crime_incident_id) DO NOTHING;
  
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_backfill_crime_tract_queue TO authenticated;

-- ============================================================================
-- STEP 7: Stats function to check progress
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_crime_tract_assignment_stats(
  p_city TEXT DEFAULT NULL,
  p_state TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_incidents BIGINT,
  assigned_count BIGINT,
  unassigned_count BIGINT,
  queue_pending BIGINT,
  queue_processing BIGINT,
  queue_completed BIGINT,
  queue_failed BIGINT,
  assignment_pct NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    COUNT(*)::BIGINT as total_incidents,
    COUNT(*) FILTER (WHERE tract_fips IS NOT NULL)::BIGINT as assigned_count,
    COUNT(*) FILTER (WHERE tract_fips IS NULL AND location IS NOT NULL)::BIGINT as unassigned_count,
    (SELECT COUNT(*) FROM crime_tract_queue WHERE status = 'pending')::BIGINT as queue_pending,
    (SELECT COUNT(*) FROM crime_tract_queue WHERE status = 'processing')::BIGINT as queue_processing,
    (SELECT COUNT(*) FROM crime_tract_queue WHERE status = 'completed')::BIGINT as queue_completed,
    (SELECT COUNT(*) FROM crime_tract_queue WHERE status = 'failed')::BIGINT as queue_failed,
    ROUND(
      COUNT(*) FILTER (WHERE tract_fips IS NOT NULL)::NUMERIC * 100.0 / 
      NULLIF(COUNT(*) FILTER (WHERE location IS NOT NULL), 0), 
      2
    ) as assignment_pct
  FROM crime_incidents
  WHERE (p_city IS NULL OR city = p_city)
    AND (p_state IS NULL OR state = p_state);
$$;

GRANT EXECUTE ON FUNCTION fn_crime_tract_assignment_stats TO authenticated;
GRANT EXECUTE ON FUNCTION fn_crime_tract_assignment_stats TO anon;
