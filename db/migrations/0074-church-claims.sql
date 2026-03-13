-- =====================================================================
-- CHURCH CLAIMS SYSTEM
-- =====================================================================
-- Migration 0074: Church claiming workflow
-- 
-- This migration establishes the church claiming system that allows
-- users to submit claims to become church admins within city platforms.
--
-- Key features:
-- - Users can submit claims for unclaimed churches
-- - Platform admins can approve/reject claims
-- - On approval: user becomes church_admin in city_platform_users
-- - On approval: city_platform_churches is_claimed flag is set
-- =====================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- 1. CHURCH CLAIMS TABLE
-- =====================================================================

CREATE TABLE IF NOT EXISTS church_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  church_id UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  city_platform_id UUID NOT NULL REFERENCES city_platforms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Claim status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  
  -- Claimant info
  role_at_church TEXT, -- e.g., "Pastor", "Office Manager"
  phone TEXT,
  verification_notes TEXT, -- User's explanation of their connection to the church
  
  -- Review info
  reviewer_notes TEXT, -- Admin notes on decision
  reviewed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- One claim per user per church per platform
  UNIQUE(church_id, user_id, city_platform_id)
);

-- =====================================================================
-- 2. INDEXES
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_church_claims_church ON church_claims(church_id);
CREATE INDEX IF NOT EXISTS idx_church_claims_platform ON church_claims(city_platform_id);
CREATE INDEX IF NOT EXISTS idx_church_claims_user ON church_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_church_claims_status ON church_claims(status);
CREATE INDEX IF NOT EXISTS idx_church_claims_pending ON church_claims(city_platform_id, status) WHERE status = 'pending';

-- =====================================================================
-- 3. ROW LEVEL SECURITY
-- =====================================================================

ALTER TABLE church_claims ENABLE ROW LEVEL SECURITY;

-- Users can view their own claims
CREATE POLICY "church_claims_user_read" ON church_claims
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
  );

-- Platform admins and super admins can view all claims for their platforms
CREATE POLICY "church_claims_admin_read" ON church_claims
  FOR SELECT TO authenticated USING (
    -- Super admins can see all claims
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
    -- Platform owners and admins can see claims for their platforms
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.city_platform_id = church_claims.city_platform_id
        AND cpu.user_id = auth.uid()
        AND cpu.role IN ('platform_owner', 'platform_admin')
        AND cpu.is_active = true
    )
  );

-- Authenticated users can submit claims
CREATE POLICY "church_claims_user_insert" ON church_claims
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
  );

-- Platform admins can update claims (approve/reject)
CREATE POLICY "church_claims_admin_update" ON church_claims
  FOR UPDATE TO authenticated USING (
    -- Super admins can update all claims
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
    -- Platform owners and admins can update claims for their platforms
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.city_platform_id = church_claims.city_platform_id
        AND cpu.user_id = auth.uid()
        AND cpu.role IN ('platform_owner', 'platform_admin')
        AND cpu.is_active = true
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.city_platform_id = church_claims.city_platform_id
        AND cpu.user_id = auth.uid()
        AND cpu.role IN ('platform_owner', 'platform_admin')
        AND cpu.is_active = true
    )
  );

-- Users can delete their own pending claims
CREATE POLICY "church_claims_user_delete" ON church_claims
  FOR DELETE TO authenticated USING (
    user_id = auth.uid() AND status = 'pending'
  );

-- Platform admins can delete claims (for cleanup)
CREATE POLICY "church_claims_admin_delete" ON church_claims
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
        AND cpu.role = 'super_admin'
        AND cpu.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.city_platform_id = church_claims.city_platform_id
        AND cpu.user_id = auth.uid()
        AND cpu.role IN ('platform_owner', 'platform_admin')
        AND cpu.is_active = true
    )
  );
