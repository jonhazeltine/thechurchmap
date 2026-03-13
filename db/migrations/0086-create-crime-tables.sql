-- Create crime metrics table for FBI Crime Data API data
-- Run in Supabase SQL Editor

-- FBI agency-level crime metrics (annual)
CREATE TABLE IF NOT EXISTS crime_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_ori TEXT NOT NULL,
  agency_name TEXT NOT NULL,
  state TEXT NOT NULL,
  county TEXT,
  year INTEGER NOT NULL,
  population INTEGER,
  violent_crime INTEGER DEFAULT 0,
  property_crime INTEGER DEFAULT 0,
  homicide INTEGER DEFAULT 0,
  robbery INTEGER DEFAULT 0,
  aggravated_assault INTEGER DEFAULT 0,
  burglary INTEGER DEFAULT 0,
  larceny INTEGER DEFAULT 0,
  motor_vehicle_theft INTEGER DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'fbi_ucr',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agency_ori, year)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_crime_metrics_state ON crime_metrics(state);
CREATE INDEX IF NOT EXISTS idx_crime_metrics_county ON crime_metrics(county);
CREATE INDEX IF NOT EXISTS idx_crime_metrics_year ON crime_metrics(year);

-- ArcGIS incident-level crime data (per-city, detailed)
CREATE TABLE IF NOT EXISTS crime_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  incident_date TIMESTAMPTZ,
  offense_type TEXT NOT NULL,
  address TEXT,
  location geography(Point, 4326),
  source TEXT NOT NULL,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_crime_incidents_city ON crime_incidents(city);
CREATE INDEX IF NOT EXISTS idx_crime_incidents_state ON crime_incidents(state);
CREATE INDEX IF NOT EXISTS idx_crime_incidents_date ON crime_incidents(incident_date);
CREATE INDEX IF NOT EXISTS idx_crime_incidents_type ON crime_incidents(offense_type);
CREATE INDEX IF NOT EXISTS idx_crime_incidents_location ON crime_incidents USING GIST(location);

-- Ingestion runs audit table
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset TEXT NOT NULL, -- 'boundaries', 'churches', 'health', 'crime_fbi', 'crime_arcgis'
  state TEXT,
  city TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
  features_fetched INTEGER DEFAULT 0,
  features_inserted INTEGER DEFAULT 0,
  features_updated INTEGER DEFAULT 0,
  features_skipped INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_dataset ON ingestion_runs(dataset);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_state ON ingestion_runs(state);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_status ON ingestion_runs(status);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_started ON ingestion_runs(started_at);

-- Add updated_at trigger for crime_metrics
CREATE OR REPLACE FUNCTION update_crime_metrics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_crime_metrics_updated_at ON crime_metrics;
CREATE TRIGGER trigger_crime_metrics_updated_at
  BEFORE UPDATE ON crime_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_crime_metrics_updated_at();
