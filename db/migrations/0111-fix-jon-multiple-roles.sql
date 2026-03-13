-- =====================================================================
-- FIX: Restore platform_owner role for Jon Hazeltine
-- =====================================================================
-- Migration 0111: Fix multiple roles per platform
-- 
-- Background: The church claim approval logic was incorrectly UPDATING
-- existing city_platform_users records instead of INSERTING new ones.
-- This caused platform_owner roles to be overwritten with church_admin.
--
-- The unique index on city_platform_users is:
--   (city_platform_id, user_id, role) WHERE city_platform_id IS NOT NULL
-- This allows multiple roles per user per platform (which is correct).
--
-- This migration restores Jon's platform_owner role for Grand Rapids.
-- =====================================================================

-- Grand Rapids Platform ID: 6a51f189-5c96-4883-b7f9-adb185d53916
-- Jon's email: jhazeltine@gmail.com

-- Step 1: Find Jon's user_id (run this first to get the UUID)
-- SELECT id FROM auth.users WHERE email = 'jhazeltine@gmail.com';

-- Step 2: Check current roles for Jon in Grand Rapids
-- SELECT cpu.*, cp.name as platform_name, c.name as church_name
-- FROM city_platform_users cpu
-- LEFT JOIN city_platforms cp ON cpu.city_platform_id = cp.id
-- LEFT JOIN churches c ON cpu.church_id = c.id
-- WHERE cpu.user_id = '<JON_USER_ID>'
-- AND cpu.city_platform_id = '6a51f189-5c96-4883-b7f9-adb185d53916';

-- Step 3: Insert platform_owner role (only if it doesn't exist)
-- Replace '<JON_USER_ID>' with the actual UUID from Step 1
INSERT INTO city_platform_users (city_platform_id, user_id, role, is_active, created_at, updated_at)
SELECT 
  '6a51f189-5c96-4883-b7f9-adb185d53916',
  u.id,
  'platform_owner',
  true,
  NOW(),
  NOW()
FROM auth.users u
WHERE u.email = 'jhazeltine@gmail.com'
AND NOT EXISTS (
  SELECT 1 FROM city_platform_users cpu
  WHERE cpu.city_platform_id = '6a51f189-5c96-4883-b7f9-adb185d53916'
  AND cpu.user_id = u.id
  AND cpu.role = 'platform_owner'
);

-- Verify the fix worked:
-- SELECT cpu.role, cpu.church_id, cpu.is_active, c.name as church_name
-- FROM city_platform_users cpu
-- LEFT JOIN churches c ON cpu.church_id = c.id
-- WHERE cpu.user_id = (SELECT id FROM auth.users WHERE email = 'jhazeltine@gmail.com')
-- AND cpu.city_platform_id = '6a51f189-5c96-4883-b7f9-adb185d53916';
