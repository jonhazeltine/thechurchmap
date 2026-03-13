-- =====================================================================
-- CITY PLATFORM APPLICATIONS
-- =====================================================================
-- Migration 0077: Platform application workflow
-- 
-- This migration establishes the application system for users to request
-- creation of new city platforms. Super admins can approve/reject these
-- applications, and on approval the platform is auto-provisioned.
--
-- Key features:
-- - Users can apply to create a new platform
-- - Super admins review applications
-- - On approval: platform is created, applicant becomes platform_owner
-- - Boundaries are linked to the new platform
-- =====================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- 1. CITY PLATFORM APPLICATIONS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS city_platform_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Applicant info
  applicant_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  applicant_email TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  
  -- Requested platform details
  requested_platform_name TEXT NOT NULL,
  requested_platform_slug TEXT,
  requested_boundary_type TEXT NOT NULL CHECK (requested_boundary_type IN ('city', 'county', 'zip', 'school_district', 'custom')),
  boundary_ids UUID[] NOT NULL DEFAULT '{}',
  
  -- Application content
  city_description TEXT NOT NULL,
  ministry_vision TEXT NOT NULL,
  existing_partners TEXT,
  leadership_experience TEXT,
  expected_timeline TEXT,
  
  -- Status and review
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'approved', 'rejected')),
  reviewer_notes TEXT,
  reviewed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  
  -- Created platform reference (set on approval)
  created_platform_id UUID REFERENCES city_platforms(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 2. INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_city_platform_applications_applicant ON city_platform_applications(applicant_user_id);
CREATE INDEX IF NOT EXISTS idx_city_platform_applications_status ON city_platform_applications(status);
CREATE INDEX IF NOT EXISTS idx_city_platform_applications_pending ON city_platform_applications(applicant_user_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_city_platform_applications_created_at ON city_platform_applications(created_at DESC);

-- =====================================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================================

ALTER TABLE city_platform_applications ENABLE ROW LEVEL SECURITY;

-- Users can view their own applications
DROP POLICY IF EXISTS "city_platform_applications_user_read" ON city_platform_applications;
CREATE POLICY "city_platform_applications_user_read" ON city_platform_applications
  FOR SELECT TO authenticated USING (
    applicant_user_id = auth.uid()
  );

-- Users can create their own applications
DROP POLICY IF EXISTS "city_platform_applications_user_insert" ON city_platform_applications;
CREATE POLICY "city_platform_applications_user_insert" ON city_platform_applications
  FOR INSERT TO authenticated WITH CHECK (
    applicant_user_id = auth.uid()
  );

-- Super admins can view all applications
DROP POLICY IF EXISTS "city_platform_applications_super_admin_read" ON city_platform_applications;
CREATE POLICY "city_platform_applications_super_admin_read" ON city_platform_applications
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
  );

-- Super admins can update all applications
DROP POLICY IF EXISTS "city_platform_applications_super_admin_update" ON city_platform_applications;
CREATE POLICY "city_platform_applications_super_admin_update" ON city_platform_applications
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
  );

-- =====================================================================
-- 4. UPDATE TRIGGER
-- =====================================================================

CREATE OR REPLACE FUNCTION update_city_platform_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_city_platform_applications_updated_at ON city_platform_applications;
CREATE TRIGGER trigger_update_city_platform_applications_updated_at
  BEFORE UPDATE ON city_platform_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_city_platform_applications_updated_at();
