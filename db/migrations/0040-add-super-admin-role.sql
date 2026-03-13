-- Migration: Add Super Admin Role Support
-- Description: Adds helper function to check for super_admin role in user metadata
-- Date: 2025-11-24

-- Helper function to check if a user is a super admin
-- Super admins have { super_admin: true } in their auth.users.raw_user_meta_data
CREATE OR REPLACE FUNCTION fn_is_super_admin(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = check_user_id
    AND (raw_user_meta_data->>'super_admin')::boolean = true
  );
END;
$$;

-- Helper function to check if current authenticated user is a super admin
CREATE OR REPLACE FUNCTION fn_current_user_is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN fn_is_super_admin(auth.uid());
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_is_super_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_current_user_is_super_admin() TO authenticated;

COMMENT ON FUNCTION fn_is_super_admin(UUID) IS 'Check if a specific user has super_admin role in metadata';
COMMENT ON FUNCTION fn_current_user_is_super_admin() IS 'Check if current authenticated user is a super admin';
