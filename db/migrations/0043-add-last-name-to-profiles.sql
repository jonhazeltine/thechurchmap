-- =====================================================================
-- Migration: 0043-add-last-name-to-profiles.sql
-- Purpose: Add last_name column to profiles table for admin editing
-- Date: November 24, 2025
-- =====================================================================
-- This migration adds the last_name column to the profiles table
-- to support full name editing in the admin panel.
-- Note: Email lives in auth.users, not profiles.
-- =====================================================================

-- Add last_name column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_name text;

COMMENT ON COLUMN public.profiles.last_name IS 'User last name (full, not just initial)';

-- Optional: Populate last_name from existing data if needed
-- (This is safe to run even if last_name already has data)
UPDATE public.profiles 
SET last_name = ''
WHERE last_name IS NULL;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Added last_name column to profiles table';
  RAISE NOTICE '📋 Note: Email remains in auth.users table (not profiles)';
END $$;
