-- =====================================================================
-- PLATFORM SETTINGS: AUTO-APPROVE MEMBERS
-- =====================================================================
-- Migration 0076: Add auto_approve_members column to city_platforms
-- 
-- This allows platform owners to configure whether new membership requests
-- are automatically approved or require manual review.
-- =====================================================================

-- Add auto_approve_members column (default false = require approval)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'city_platforms' AND column_name = 'auto_approve_members'
  ) THEN
    ALTER TABLE city_platforms ADD COLUMN auto_approve_members BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
