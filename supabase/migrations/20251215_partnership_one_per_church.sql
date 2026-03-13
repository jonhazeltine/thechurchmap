-- Migration: One Application Per Church Model
-- Creates submission history table and consolidates duplicate applications

-- 1. Create partnership_application_submissions table
CREATE TABLE IF NOT EXISTS partnership_application_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES partnership_applications(id) ON DELETE CASCADE,
  path TEXT NOT NULL CHECK (path IN ('explore', 'authorize')),
  applicant_name TEXT NOT NULL,
  applicant_role TEXT NOT NULL,
  applicant_email TEXT NOT NULL,
  applicant_phone TEXT,
  has_authority_affirmation BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_submissions_application_id ON partnership_application_submissions(application_id);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON partnership_application_submissions(created_at DESC);

-- 2. Migrate existing data: Create submission records for all existing applications
INSERT INTO partnership_application_submissions (
  application_id,
  path,
  applicant_name,
  applicant_role,
  applicant_email,
  applicant_phone,
  has_authority_affirmation,
  notes,
  user_id,
  created_at
)
SELECT 
  id,
  path,
  applicant_name,
  applicant_role,
  applicant_email,
  applicant_phone,
  has_authority_affirmation,
  notes,
  user_id,
  created_at
FROM partnership_applications;

-- 3. For duplicate church_ids, consolidate to keep only one application per church
-- Strategy: Keep the non-closed one, or the most recent if all closed

-- Create temp table to identify which applications to keep (one per church)
CREATE TEMP TABLE apps_to_keep AS
SELECT DISTINCT ON (church_id) id, church_id
FROM partnership_applications
ORDER BY church_id, 
  CASE WHEN status != 'closed' THEN 0 ELSE 1 END,
  created_at DESC;

-- Create mapping from church_id to the kept application id
CREATE TEMP TABLE church_to_kept_app AS
SELECT church_id, id as kept_app_id
FROM apps_to_keep;

-- Update submissions from discarded apps to point to the kept app for the same church
UPDATE partnership_application_submissions s
SET application_id = ck.kept_app_id
FROM partnership_applications pa
JOIN church_to_kept_app ck ON ck.church_id = pa.church_id
WHERE s.application_id = pa.id
  AND pa.id != ck.kept_app_id;

-- Delete duplicate applications (not in apps_to_keep)
DELETE FROM partnership_applications
WHERE id NOT IN (SELECT id FROM apps_to_keep);

-- Drop temp tables
DROP TABLE church_to_kept_app;
DROP TABLE apps_to_keep;

-- 4. Add unique constraint on church_id
ALTER TABLE partnership_applications
ADD CONSTRAINT partnership_applications_church_id_unique UNIQUE (church_id);

-- 5. Add submission_count column for quick reference
ALTER TABLE partnership_applications
ADD COLUMN IF NOT EXISTS submission_count INTEGER DEFAULT 1;

-- Update submission counts
UPDATE partnership_applications pa
SET submission_count = (
  SELECT COUNT(*) FROM partnership_application_submissions s
  WHERE s.application_id = pa.id
);
