-- =====================================================================
-- USER ONBOARDING & PENDING CHURCHES
-- =====================================================================
-- Migration 0082: Add onboarding support with church selection
-- 
-- This migration enables the multi-step signup flow where users:
-- 1. Select their church from existing database
-- 2. Or submit a new church for admin review
-- 3. Get auto-joined to city platforms if their church is already linked
-- =====================================================================

-- Add church_id to profiles (user's primary church)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'church_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN church_id uuid REFERENCES churches(id) ON DELETE SET NULL;
    COMMENT ON COLUMN profiles.church_id IS 'User primary church association';
  END IF;
END $$;

-- Add onboarding_completed flag to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'onboarding_completed'
  ) THEN
    ALTER TABLE profiles ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT false;
    COMMENT ON COLUMN profiles.onboarding_completed IS 'Whether user has completed the onboarding wizard';
  END IF;
END $$;

-- Set existing users as onboarding completed (they signed up before this feature)
UPDATE profiles SET onboarding_completed = true WHERE onboarding_completed = false;

-- Create pending_churches table for unverified church submissions
CREATE TABLE IF NOT EXISTS pending_churches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  city text,
  state text,
  zip text,
  denomination text,
  website text,
  phone text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  reviewer_notes text,
  created_church_id uuid REFERENCES churches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for pending_churches
CREATE INDEX IF NOT EXISTS idx_pending_churches_status ON pending_churches(status);
CREATE INDEX IF NOT EXISTS idx_pending_churches_submitted_by ON pending_churches(submitted_by_user_id);

-- Enable RLS on pending_churches
ALTER TABLE pending_churches ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pending_churches

-- Users can view their own submissions
CREATE POLICY "Users can view own pending churches"
  ON pending_churches FOR SELECT
  USING (auth.uid() = submitted_by_user_id);

-- Users can insert their own submissions
CREATE POLICY "Users can submit pending churches"
  ON pending_churches FOR INSERT
  WITH CHECK (auth.uid() = submitted_by_user_id);

-- Super admins and platform admins can view all pending churches
CREATE POLICY "Admins can view all pending churches"
  ON pending_churches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role IN ('super_admin', 'platform_admin', 'platform_owner')
      AND pr.is_active = true
    )
  );

-- Super admins can update pending churches (approve/reject)
CREATE POLICY "Super admins can update pending churches"
  ON pending_churches FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'super_admin'
      AND pr.is_active = true
    )
  );

-- Create function to search churches with platform info
CREATE OR REPLACE FUNCTION fn_search_churches_for_onboarding(
  search_query text,
  result_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  city text,
  state text,
  denomination text,
  platform_id uuid,
  platform_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.address,
    c.city,
    c.state,
    c.denomination,
    cp.id as platform_id,
    cp.name as platform_name
  FROM churches c
  LEFT JOIN city_platform_churches cpc ON c.id = cpc.church_id AND cpc.status = 'visible'
  LEFT JOIN city_platforms cp ON cpc.city_platform_id = cp.id AND cp.is_active = true
  WHERE 
    c.name ILIKE '%' || search_query || '%'
    OR c.address ILIKE '%' || search_query || '%'
    OR c.city ILIKE '%' || search_query || '%'
  ORDER BY 
    -- Prioritize churches that are part of active platforms
    CASE WHEN cp.id IS NOT NULL THEN 0 ELSE 1 END,
    -- Then by name similarity
    similarity(c.name, search_query) DESC,
    c.name
  LIMIT result_limit;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION fn_search_churches_for_onboarding(text, int) TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 0082: User onboarding & pending churches complete';
  RAISE NOTICE '📋 Added church_id and onboarding_completed to profiles';
  RAISE NOTICE '📋 Created pending_churches table with RLS';
  RAISE NOTICE '📋 Created fn_search_churches_for_onboarding function';
END $$;
