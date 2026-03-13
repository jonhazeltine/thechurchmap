-- Data Source Configuration Table
-- Stores configuration for all data sources (crime, health, demographics, boundaries, churches)
-- Supports manual triggering and Scheduled Deployment scheduling

-- Create ENUM types for type safety
DO $$ BEGIN
  CREATE TYPE data_source_type AS ENUM ('crime', 'health', 'demographics', 'boundaries', 'churches');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE data_source_category AS ENUM ('arcgis', 'socrata', 'carto', 'ckan', 'api', 'osm', 'tigerweb', 'cdc', 'census');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE frequency_label AS ENUM ('Hourly', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly', 'Manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE run_status AS ENUM ('pending', 'running', 'success', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS data_source_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Source identification
  source_key TEXT NOT NULL UNIQUE, -- e.g., 'crime_las_vegas', 'cdc_places', 'census_acs', 'tigerweb', 'osm_churches'
  source_name TEXT NOT NULL,       -- Human readable name e.g., 'Las Vegas Crime Data'
  source_type data_source_type NOT NULL,
  source_category data_source_category,
  
  -- Configuration
  enabled BOOLEAN DEFAULT true,
  cumulative_mode BOOLEAN DEFAULT false, -- If true, don't clear data before ingesting (for rolling data like DC, Atlanta)
  
  -- Scheduling (cron format)
  cron_expression TEXT,            -- e.g., '0 2 * * 0' for Sunday at 2 AM
  frequency_label frequency_label, -- Human readable: 'Weekly', 'Monthly', 'Quarterly', 'Daily'
  
  -- Run tracking
  last_run_at TIMESTAMPTZ,
  last_run_status run_status,      -- 'pending', 'running', 'success', 'failed'
  last_run_duration_ms INTEGER,
  last_run_records INTEGER,
  next_run_at TIMESTAMPTZ,
  
  -- Error tracking
  last_error_message TEXT,
  consecutive_failures INTEGER DEFAULT 0,
  
  -- Metadata
  endpoint_url TEXT,               -- Primary endpoint URL for reference
  state TEXT,                      -- State code for state-specific sources
  city TEXT,                       -- City name for city-specific sources (crime)
  record_count INTEGER DEFAULT 0,  -- Total records in database for this source
  
  -- Post-processing flags
  requires_deduplication BOOLEAN DEFAULT false, -- For OSM churches
  requires_tract_assignment BOOLEAN DEFAULT false, -- For crime data
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_data_source_config_type ON data_source_config(source_type);
CREATE INDEX IF NOT EXISTS idx_data_source_config_enabled ON data_source_config(enabled);
CREATE INDEX IF NOT EXISTS idx_data_source_config_next_run ON data_source_config(next_run_at);
CREATE INDEX IF NOT EXISTS idx_data_source_config_category ON data_source_config(source_category);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_data_source_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_data_source_config_updated_at ON data_source_config;
CREATE TRIGGER trigger_data_source_config_updated_at
  BEFORE UPDATE ON data_source_config
  FOR EACH ROW
  EXECUTE FUNCTION update_data_source_config_updated_at();

-- Update ingestion_runs to link to data_source_config
ALTER TABLE ingestion_runs ADD COLUMN IF NOT EXISTS data_source_id UUID REFERENCES data_source_config(id);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_source_id ON ingestion_runs(data_source_id);

-- RLS policies
ALTER TABLE data_source_config ENABLE ROW LEVEL SECURITY;

-- Super admins can read/write (check user metadata for super_admin role)
CREATE POLICY "super_admins_all_data_source_config" ON data_source_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'super_admin'
    )
  );

-- Allow service role full access
CREATE POLICY "service_role_all_data_source_config" ON data_source_config
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Grant access
GRANT ALL ON data_source_config TO authenticated;
GRANT ALL ON data_source_config TO service_role;

-- =====================================================================
-- CUMULATIVE MODE SUPPORT FOR CRIME DATA
-- Add hash column for deduplication when using cumulative mode
-- =====================================================================

-- Add incident_hash column for deduplication
ALTER TABLE crime_incidents ADD COLUMN IF NOT EXISTS incident_hash TEXT;

-- Create unique index on incident_hash for upsert support
CREATE UNIQUE INDEX IF NOT EXISTS idx_crime_incidents_hash ON crime_incidents(incident_hash) WHERE incident_hash IS NOT NULL;

-- Function to compute incident hash
CREATE OR REPLACE FUNCTION compute_incident_hash(
  p_city TEXT,
  p_state TEXT,
  p_date TIMESTAMPTZ,
  p_case_number TEXT,
  p_offense_type TEXT,
  p_address TEXT
) RETURNS TEXT AS $$
BEGIN
  RETURN md5(
    COALESCE(p_city, '') || '|' ||
    COALESCE(p_state, '') || '|' ||
    COALESCE(p_date::TEXT, '') || '|' ||
    COALESCE(p_case_number, '') || '|' ||
    COALESCE(p_offense_type, '') || '|' ||
    COALESCE(p_address, '')
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Backfill existing incidents with hash (run separately if table is large)
-- UPDATE crime_incidents SET incident_hash = compute_incident_hash(city, state, incident_date, case_number, offense_type, address) WHERE incident_hash IS NULL;
