-- Crime Rolling Window RPC Functions
-- Uses existing tract_fips column for efficient aggregation
-- Run in Supabase SQL Editor

-- ============================================================================
-- STEP 1: Create rolling window aggregation function
-- This aggregates crime counts by tract_fips and normalized_type
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_crime_rolling_window_aggregate(
  p_state_abbr TEXT,
  p_months INTEGER DEFAULT 12
)
RETURNS TABLE (
  tract_fips TEXT,
  metric_key TEXT,
  incident_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    ci.tract_fips,
    ci.normalized_type as metric_key,
    COUNT(*)::BIGINT as incident_count
  FROM crime_incidents ci
  WHERE ci.state = p_state_abbr
    AND ci.tract_fips IS NOT NULL
    AND ci.normalized_type IS NOT NULL
    AND ci.incident_date >= (CURRENT_DATE - (p_months || ' months')::INTERVAL)
  GROUP BY ci.tract_fips, ci.normalized_type
$$;

GRANT EXECUTE ON FUNCTION fn_crime_rolling_window_aggregate TO authenticated;
GRANT EXECUTE ON FUNCTION fn_crime_rolling_window_aggregate TO anon;

-- ============================================================================
-- STEP 2: Create function to get rolling window stats for a state
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_crime_rolling_window_stats(
  p_state_abbr TEXT,
  p_months INTEGER DEFAULT 12
)
RETURNS TABLE (
  total_incidents BIGINT,
  tracts_with_data BIGINT,
  unique_crime_types BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    COUNT(*)::BIGINT as total_incidents,
    COUNT(DISTINCT tract_fips)::BIGINT as tracts_with_data,
    COUNT(DISTINCT normalized_type)::BIGINT as unique_crime_types
  FROM crime_incidents
  WHERE state = p_state_abbr
    AND tract_fips IS NOT NULL
    AND normalized_type IS NOT NULL
    AND incident_date >= (CURRENT_DATE - (p_months || ' months')::INTERVAL);
$$;

GRANT EXECUTE ON FUNCTION fn_crime_rolling_window_stats TO authenticated;
GRANT EXECUTE ON FUNCTION fn_crime_rolling_window_stats TO anon;

-- ============================================================================
-- STEP 3: Test the function
-- ============================================================================

-- Test with Illinois (Chicago)
SELECT * FROM fn_crime_rolling_window_stats('IL', 12);

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
