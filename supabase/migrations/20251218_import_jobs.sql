-- Import Jobs table for tracking Google Places import progress and history
-- Allows resuming interrupted imports and viewing import history

CREATE TABLE IF NOT EXISTS import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_platform_id UUID NOT NULL REFERENCES city_platforms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'interrupted')),
  
  -- Grid point progress (for resume capability)
  grid_points_total INTEGER NOT NULL DEFAULT 0,
  grid_points_completed INTEGER NOT NULL DEFAULT 0,
  grid_points_data JSONB, -- Stores the grid points array for resume
  
  -- Bounding box (for resume - don't recalculate)
  bounding_box JSONB, -- {min_lat, max_lat, min_lng, max_lng}
  
  -- Churches found during grid search (before filtering/dedup)
  churches_found_raw INTEGER NOT NULL DEFAULT 0,
  
  -- Final stats
  churches_in_boundaries INTEGER NOT NULL DEFAULT 0,
  churches_outside_boundaries INTEGER NOT NULL DEFAULT 0,
  duplicates_skipped INTEGER NOT NULL DEFAULT 0,
  churches_inserted INTEGER NOT NULL DEFAULT 0,
  churches_linked INTEGER NOT NULL DEFAULT 0,
  
  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Error info
  error_message TEXT,
  
  -- Indexes
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for finding platform's import history
CREATE INDEX IF NOT EXISTS idx_import_jobs_platform ON import_jobs(city_platform_id, started_at DESC);

-- Index for finding incomplete jobs (for resume)
CREATE INDEX IF NOT EXISTS idx_import_jobs_incomplete ON import_jobs(city_platform_id, status) 
  WHERE status IN ('running', 'interrupted');

-- RLS policies
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

-- Allow super admins and platform admins to view import jobs
CREATE POLICY "import_jobs_select_policy" ON import_jobs
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM city_platform_users 
      WHERE city_platform_id = import_jobs.city_platform_id 
      AND role IN ('platform_owner', 'platform_admin')
      AND is_active = true
    )
    OR 
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'super_admin' = 'true'
  );

-- Allow super admins and platform admins to insert/update import jobs
CREATE POLICY "import_jobs_insert_policy" ON import_jobs
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM city_platform_users 
      WHERE city_platform_id = import_jobs.city_platform_id 
      AND role IN ('platform_owner', 'platform_admin')
      AND is_active = true
    )
    OR 
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'super_admin' = 'true'
  );

CREATE POLICY "import_jobs_update_policy" ON import_jobs
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT user_id FROM city_platform_users 
      WHERE city_platform_id = import_jobs.city_platform_id 
      AND role IN ('platform_owner', 'platform_admin')
      AND is_active = true
    )
    OR 
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'super_admin' = 'true'
  );

COMMENT ON TABLE import_jobs IS 'Tracks Google Places import jobs for city platforms with progress tracking and resume capability';
