-- Crime Tract Assignment Cron Job Setup
-- Requires pg_cron extension (enabled by default in Supabase)
-- Run in Supabase SQL Editor

-- ============================================================================
-- Enable pg_cron extension (if not already enabled)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres user
GRANT USAGE ON SCHEMA cron TO postgres;

-- ============================================================================
-- Create the cron job to process tract assignments every 2 minutes
-- ============================================================================

-- First, remove any existing job with the same name
SELECT cron.unschedule('process-crime-tract-queue');

-- Schedule the job to run every 2 minutes
SELECT cron.schedule(
  'process-crime-tract-queue',           -- job name
  '*/2 * * * *',                          -- every 2 minutes
  $$SELECT fn_process_crime_tract_queue(5000)$$  -- process 5000 at a time
);

-- ============================================================================
-- Verify the job was created
-- ============================================================================

SELECT * FROM cron.job WHERE jobname = 'process-crime-tract-queue';

-- ============================================================================
-- To check job execution history (after it runs):
-- ============================================================================

-- SELECT * FROM cron.job_run_details 
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-crime-tract-queue')
-- ORDER BY start_time DESC 
-- LIMIT 10;

-- ============================================================================
-- To manually pause/resume the job:
-- ============================================================================

-- Pause: SELECT cron.unschedule('process-crime-tract-queue');
-- Resume: Run the schedule command above again

-- ============================================================================
-- To stop and remove the job completely:
-- ============================================================================

-- SELECT cron.unschedule('process-crime-tract-queue');
