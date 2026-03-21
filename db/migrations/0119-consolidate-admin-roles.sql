-- Migration: Consolidate Admin Role System
-- Description: Unifies admin permission checks to use city_platform_users as the canonical source.
--              Creates helper functions and updates RLS policies to stop using platform_roles.
--              Does NOT drop platform_roles table (kept for backward compatibility).
-- Date: 2026-03-21
-- Depends on: 0072-city-platforms-foundation.sql (city_platform_users table)

-- =====================================================================
-- 1. HELPER FUNCTIONS
-- =====================================================================

-- fn_current_user_is_super_admin: Checks city_platform_users for super_admin role.
-- NOTE: We keep the existing user_metadata-based check as a fallback since
-- super_admin may be stored in user_metadata OR city_platform_users.
CREATE OR REPLACE FUNCTION fn_current_user_is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Check user_metadata first (fast path)
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND (raw_user_meta_data->>'super_admin')::boolean = true
  ) THEN
    RETURN true;
  END IF;

  -- Also check city_platform_users for super_admin role
  RETURN EXISTS (
    SELECT 1 FROM public.city_platform_users
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
    AND is_active = true
  );
END;
$$;

-- fn_current_user_is_platform_admin: Checks city_platform_users for
-- super_admin, platform_owner, or platform_admin roles.
CREATE OR REPLACE FUNCTION fn_current_user_is_platform_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Check super admin first (user_metadata fast path)
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND (raw_user_meta_data->>'super_admin')::boolean = true
  ) THEN
    RETURN true;
  END IF;

  -- Check city_platform_users for admin roles
  RETURN EXISTS (
    SELECT 1 FROM public.city_platform_users
    WHERE user_id = auth.uid()
    AND role IN ('super_admin', 'platform_owner', 'platform_admin')
    AND is_active = true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_current_user_is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_current_user_is_platform_admin() TO authenticated;

-- =====================================================================
-- 2. UPDATE RLS POLICIES
-- Replace platform_roles references with city_platform_users references.
-- =====================================================================

-- ----- PROFILES -----
DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
CREATE POLICY profiles_select_admin
  ON public.profiles
  FOR SELECT
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin
  ON public.profiles
  FOR UPDATE
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

-- ----- CHURCH USER ROLES -----
DROP POLICY IF EXISTS church_user_roles_select_platform_admin ON public.church_user_roles;
CREATE POLICY church_user_roles_select_platform_admin
  ON public.church_user_roles
  FOR SELECT
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

DROP POLICY IF EXISTS church_user_roles_all_platform_admin ON public.church_user_roles;
CREATE POLICY church_user_roles_all_platform_admin
  ON public.church_user_roles
  FOR ALL
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

-- ----- PLATFORM ROLES (self-referencing policies now use city_platform_users) -----
DROP POLICY IF EXISTS platform_roles_select_admin ON public.platform_roles;
CREATE POLICY platform_roles_select_admin
  ON public.platform_roles
  FOR SELECT
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

DROP POLICY IF EXISTS platform_roles_all_admin ON public.platform_roles;
CREATE POLICY platform_roles_all_admin
  ON public.platform_roles
  FOR ALL
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

-- ----- CHURCHES -----
DROP POLICY IF EXISTS churches_update_admin ON public.churches;
CREATE POLICY churches_update_admin
  ON public.churches
  FOR UPDATE
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

DROP POLICY IF EXISTS churches_delete_admin ON public.churches;
CREATE POLICY churches_delete_admin
  ON public.churches
  FOR DELETE
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

-- ----- PRAYERS -----
DROP POLICY IF EXISTS prayers_select_admin ON public.prayers;
CREATE POLICY prayers_select_admin
  ON public.prayers
  FOR SELECT
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

DROP POLICY IF EXISTS prayers_update_admin ON public.prayers;
CREATE POLICY prayers_update_admin
  ON public.prayers
  FOR UPDATE
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

DROP POLICY IF EXISTS prayers_delete_admin ON public.prayers;
CREATE POLICY prayers_delete_admin
  ON public.prayers
  FOR DELETE
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

DROP POLICY IF EXISTS prayers_insert_admin ON public.prayers;
CREATE POLICY prayers_insert_admin
  ON public.prayers
  FOR INSERT
  WITH CHECK (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

-- ----- POSTS -----
DROP POLICY IF EXISTS posts_update_admin ON public.posts;
CREATE POLICY posts_update_admin
  ON public.posts
  FOR UPDATE
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

DROP POLICY IF EXISTS posts_delete_admin ON public.posts;
CREATE POLICY posts_delete_admin
  ON public.posts
  FOR DELETE
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

-- ----- POST COMMENTS -----
DROP POLICY IF EXISTS post_comments_update_admin ON public.post_comments;
CREATE POLICY post_comments_update_admin
  ON public.post_comments
  FOR UPDATE
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

DROP POLICY IF EXISTS post_comments_delete_admin ON public.post_comments;
CREATE POLICY post_comments_delete_admin
  ON public.post_comments
  FOR DELETE
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

-- ----- PLATFORM SETTINGS -----
DROP POLICY IF EXISTS platform_settings_admin ON public.platform_settings;
CREATE POLICY platform_settings_admin
  ON public.platform_settings
  FOR ALL
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

-- ----- REGION SETTINGS (from 0064-michigan-expansion) -----
DROP POLICY IF EXISTS region_settings_admin ON public.region_settings;
CREATE POLICY region_settings_admin
  ON public.region_settings
  FOR ALL
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

-- ----- INTERNAL TAGS -----
DROP POLICY IF EXISTS internal_tags_admin ON public.internal_tags;
CREATE POLICY internal_tags_admin
  ON public.internal_tags
  FOR ALL
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

DROP POLICY IF EXISTS internal_church_tags_admin ON public.internal_church_tags;
CREATE POLICY internal_church_tags_admin
  ON public.internal_church_tags
  FOR ALL
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

-- ----- COLLABORATION TAXONOMY (from 0048) -----
DROP POLICY IF EXISTS collab_categories_admin ON public.collaboration_categories;
CREATE POLICY collab_categories_admin
  ON public.collaboration_categories
  FOR ALL
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

DROP POLICY IF EXISTS collab_tags_admin ON public.collaboration_tags;
CREATE POLICY collab_tags_admin
  ON public.collaboration_tags
  FOR ALL
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

-- ----- PENDING CHURCHES (from 0082) -----
DROP POLICY IF EXISTS pending_churches_select_admin ON public.pending_churches;
CREATE POLICY pending_churches_select_admin
  ON public.pending_churches
  FOR SELECT
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

DROP POLICY IF EXISTS pending_churches_update_admin ON public.pending_churches;
CREATE POLICY pending_churches_update_admin
  ON public.pending_churches
  FOR UPDATE
  USING (
    fn_current_user_is_super_admin()
    OR fn_current_user_is_platform_admin()
  );

-- Done! All RLS policies now use city_platform_users via helper functions.
-- The platform_roles table is preserved but no longer referenced in policies.
