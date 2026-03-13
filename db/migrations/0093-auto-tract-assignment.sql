-- Auto Tract Assignment System
-- Automatically assigns tract_fips during INSERT and universal backfill
-- Run in Supabase SQL Editor

-- ============================================================================
-- STEP 1: Create trigger function to assign tract_fips on INSERT
-- This runs BEFORE INSERT and sets tract_fips immediately (no queue needed)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_auto_assign_crime_tract()
RETURNS TRIGGER AS $$
DECLARE
  v_tract_fips TEXT;
BEGIN
  -- Only process if location exists and tract_fips is not already set
  IF NEW.location IS NOT NULL AND NEW.tract_fips IS NULL THEN
    -- Try to find the census tract using spatial index
    SELECT b.external_id INTO v_tract_fips
    FROM boundaries b
    WHERE b.type = 'census_tract'
      AND b.geometry && NEW.location::geometry  -- Bounding box filter (uses GiST index)
      AND ST_Covers(b.geometry::geometry, NEW.location::geometry)  -- Exact match
    LIMIT 1;
    
    -- Assign if found
    IF v_tract_fips IS NOT NULL THEN
      NEW.tract_fips := v_tract_fips;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger if exists (the one that queues items)
DROP TRIGGER IF EXISTS trigger_queue_crime_tract ON crime_incidents;

-- Create new BEFORE INSERT trigger for auto-assignment
DROP TRIGGER IF EXISTS trigger_auto_assign_crime_tract ON crime_incidents;
CREATE TRIGGER trigger_auto_assign_crime_tract
  BEFORE INSERT ON crime_incidents
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_assign_crime_tract();

-- ============================================================================
-- STEP 2: Fallback trigger to queue items that couldn't be assigned
-- (e.g., if census tract boundaries aren't loaded yet for that area)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_queue_unassigned_crime_tract()
RETURNS TRIGGER AS $$
BEGIN
  -- Queue items that have location but no tract_fips after auto-assignment failed
  IF NEW.location IS NOT NULL AND NEW.tract_fips IS NULL THEN
    INSERT INTO crime_tract_queue (crime_incident_id, city, state)
    VALUES (NEW.id, NEW.city, NEW.state)
    ON CONFLICT (crime_incident_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_queue_unassigned_crime_tract ON crime_incidents;
CREATE TRIGGER trigger_queue_unassigned_crime_tract
  AFTER INSERT ON crime_incidents
  FOR EACH ROW
  EXECUTE FUNCTION fn_queue_unassigned_crime_tract();

-- ============================================================================
-- STEP 3: Universal backfill function (all cities, all states)
-- Queues ALL unassigned records regardless of city/state
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_universal_backfill_crime_tract_queue(
  p_batch_size INTEGER DEFAULT 100000
)
RETURNS TABLE (
  queued_count INTEGER,
  total_unassigned BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_queued INTEGER;
  v_total BIGINT;
BEGIN
  -- Queue unassigned records that aren't already in the queue
  INSERT INTO crime_tract_queue (crime_incident_id, city, state)
  SELECT ci.id, ci.city, ci.state
  FROM crime_incidents ci
  LEFT JOIN crime_tract_queue ctq ON ctq.crime_incident_id = ci.id
  WHERE ci.tract_fips IS NULL
    AND ci.location IS NOT NULL
    AND ctq.id IS NULL  -- Not already queued
  LIMIT p_batch_size
  ON CONFLICT (crime_incident_id) DO NOTHING;
  
  GET DIAGNOSTICS v_queued = ROW_COUNT;
  
  -- Count total still unassigned (not in queue)
  SELECT COUNT(*) INTO v_total
  FROM crime_incidents ci
  LEFT JOIN crime_tract_queue ctq ON ctq.crime_incident_id = ci.id
  WHERE ci.tract_fips IS NULL
    AND ci.location IS NOT NULL
    AND ctq.id IS NULL;
  
  RETURN QUERY SELECT v_queued, v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_universal_backfill_crime_tract_queue TO authenticated;

-- ============================================================================
-- STEP 4: Universal stats function (all cities)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_crime_tract_stats_all()
RETURNS TABLE (
  city TEXT,
  state TEXT,
  total_incidents BIGINT,
  assigned_count BIGINT,
  unassigned_count BIGINT,
  assignment_pct NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    city,
    state,
    COUNT(*)::BIGINT as total_incidents,
    COUNT(*) FILTER (WHERE tract_fips IS NOT NULL)::BIGINT as assigned_count,
    COUNT(*) FILTER (WHERE tract_fips IS NULL AND location IS NOT NULL)::BIGINT as unassigned_count,
    ROUND(
      COUNT(*) FILTER (WHERE tract_fips IS NOT NULL)::NUMERIC * 100.0 / 
      NULLIF(COUNT(*) FILTER (WHERE location IS NOT NULL), 0), 
      2
    ) as assignment_pct
  FROM crime_incidents
  GROUP BY city, state
  ORDER BY unassigned_count DESC;
$$;

GRANT EXECUTE ON FUNCTION fn_crime_tract_stats_all TO authenticated;
GRANT EXECUTE ON FUNCTION fn_crime_tract_stats_all TO anon;

-- ============================================================================
-- STEP 5: Set up cron job for universal backfill (runs every 10 minutes)
-- ============================================================================

-- Remove old job if exists
SELECT cron.unschedule('universal-crime-tract-backfill') 
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'universal-crime-tract-backfill');

-- Create universal backfill cron (every 10 minutes, queues up to 50k records)
SELECT cron.schedule(
  'universal-crime-tract-backfill',
  '*/10 * * * *',
  $$SELECT fn_universal_backfill_crime_tract_queue(50000)$$
);

-- Verify jobs
SELECT jobname, schedule, command FROM cron.job 
WHERE jobname IN ('process-crime-tract-queue', 'universal-crime-tract-backfill');
