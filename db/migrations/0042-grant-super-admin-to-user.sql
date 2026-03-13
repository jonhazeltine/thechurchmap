-- Grant super admin access to jhazeltine@gmail.com
-- This updates the user_metadata in Supabase Auth

-- Note: This migration needs to be run in Supabase SQL Editor
-- because it uses auth.users which requires service role access

-- Update user metadata to set super_admin = true
UPDATE auth.users
SET raw_user_meta_data = 
  CASE 
    WHEN raw_user_meta_data IS NULL THEN '{"super_admin": true}'::jsonb
    ELSE raw_user_meta_data || '{"super_admin": true}'::jsonb
  END
WHERE email = 'jhazeltine@gmail.com';
