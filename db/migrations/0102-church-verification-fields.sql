-- Migration: Add verification and data quality fields to churches table
-- This enables tracking verification status, data quality scores, and Google Places matching

-- Add verification status enum type
DO $$ BEGIN
  CREATE TYPE church_verification_status AS ENUM ('verified', 'unverified', 'flagged_for_review');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add verification source enum type  
DO $$ BEGIN
  CREATE TYPE church_verification_source AS ENUM ('google_places', 'manual_review', 'osm', 'initial_import');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add verification fields to churches table
ALTER TABLE churches ADD COLUMN IF NOT EXISTS verification_status church_verification_status DEFAULT 'unverified';
ALTER TABLE churches ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS last_verified_source church_verification_source;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS data_quality_score INTEGER DEFAULT 0 CHECK (data_quality_score >= 0 AND data_quality_score <= 100);
ALTER TABLE churches ADD COLUMN IF NOT EXISTS data_quality_breakdown JSONB DEFAULT '{}';
ALTER TABLE churches ADD COLUMN IF NOT EXISTS google_place_id TEXT;
ALTER TABLE churches ADD COLUMN IF NOT EXISTS google_match_confidence NUMERIC(3,2) CHECK (google_match_confidence >= 0 AND google_match_confidence <= 1);
ALTER TABLE churches ADD COLUMN IF NOT EXISTS google_last_checked_at TIMESTAMPTZ;

-- Create index for verification status queries
CREATE INDEX IF NOT EXISTS idx_churches_verification_status ON churches(verification_status);
CREATE INDEX IF NOT EXISTS idx_churches_data_quality_score ON churches(data_quality_score);
CREATE INDEX IF NOT EXISTS idx_churches_google_place_id ON churches(google_place_id);

-- Create verification history table for audit trail
CREATE TABLE IF NOT EXISTS church_verification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  city_platform_id UUID REFERENCES city_platforms(id) ON DELETE SET NULL,
  verification_status church_verification_status NOT NULL,
  verification_source church_verification_source NOT NULL,
  data_quality_score INTEGER,
  google_match_confidence NUMERIC(3,2),
  reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  changes_made JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying verification history
CREATE INDEX IF NOT EXISTS idx_church_verification_events_church ON church_verification_events(church_id);
CREATE INDEX IF NOT EXISTS idx_church_verification_events_platform ON church_verification_events(city_platform_id);
CREATE INDEX IF NOT EXISTS idx_church_verification_events_created ON church_verification_events(created_at DESC);

-- Enable RLS on verification events
ALTER TABLE church_verification_events ENABLE ROW LEVEL SECURITY;

-- RLS policy: Allow authenticated users with platform access to view verification events
CREATE POLICY "Platform admins can view verification events" ON church_verification_events
  FOR SELECT
  USING (
    auth.role() = 'authenticated' AND (
      city_platform_id IS NULL OR
      EXISTS (
        SELECT 1 FROM city_platform_users cpu
        WHERE cpu.city_platform_id = church_verification_events.city_platform_id
        AND cpu.user_id = auth.uid()
        AND cpu.role IN ('owner', 'admin', 'moderator')
      ) OR
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.is_super_admin = true
      )
    )
  );

-- RLS policy: Allow platform admins to insert verification events
CREATE POLICY "Platform admins can insert verification events" ON church_verification_events
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated' AND (
      city_platform_id IS NULL OR
      EXISTS (
        SELECT 1 FROM city_platform_users cpu
        WHERE cpu.city_platform_id = church_verification_events.city_platform_id
        AND cpu.user_id = auth.uid()
        AND cpu.role IN ('owner', 'admin', 'moderator')
      ) OR
      EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.is_super_admin = true
      )
    )
  );

COMMENT ON COLUMN churches.verification_status IS 'Current verification status: verified, unverified, or flagged_for_review';
COMMENT ON COLUMN churches.last_verified_at IS 'Timestamp of last verification check';
COMMENT ON COLUMN churches.last_verified_source IS 'How the church was last verified (google_places, manual_review, etc)';
COMMENT ON COLUMN churches.data_quality_score IS 'Data completeness score from 0-100';
COMMENT ON COLUMN churches.data_quality_breakdown IS 'JSON breakdown of individual field scores';
COMMENT ON COLUMN churches.google_place_id IS 'Matched Google Places ID for cross-referencing';
COMMENT ON COLUMN churches.google_match_confidence IS 'Confidence score (0-1) of Google Places match';
COMMENT ON COLUMN churches.google_last_checked_at IS 'When this church was last checked against Google Places';
COMMENT ON TABLE church_verification_events IS 'Audit trail of all verification status changes';
