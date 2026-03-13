-- Add missing columns to crime_incidents table
-- Run in Supabase SQL Editor

-- Add case_number for deduplication (incident ID from source system)
ALTER TABLE crime_incidents 
ADD COLUMN IF NOT EXISTS case_number TEXT;

-- Add normalized_type for standardized crime category
ALTER TABLE crime_incidents 
ADD COLUMN IF NOT EXISTS normalized_type TEXT;

-- Create index on case_number for deduplication
CREATE INDEX IF NOT EXISTS idx_crime_incidents_case_number 
ON crime_incidents(case_number);

-- Create index on normalized_type for aggregation queries
CREATE INDEX IF NOT EXISTS idx_crime_incidents_normalized_type 
ON crime_incidents(normalized_type);

-- Add unique constraint for case_number + city + state to prevent duplicates
-- (Use ON CONFLICT for upsert operations)
CREATE UNIQUE INDEX IF NOT EXISTS idx_crime_incidents_unique_case 
ON crime_incidents(city, state, case_number) 
WHERE case_number IS NOT NULL;
