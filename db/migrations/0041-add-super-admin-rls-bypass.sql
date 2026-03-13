-- Migration: Add Super Admin RLS Bypass
-- Description: Updates all RLS policies to allow super_admin users to bypass restrictions
-- Date: 2025-11-24
-- Depends on: 0040-add-super-admin-role.sql

-- =====================================================================
-- STRATEGY: Add OR fn_current_user_is_super_admin() to all USING/WITH CHECK clauses
-- This allows super admins to bypass all RLS restrictions
-- =====================================================================

-- =====================================================================
-- 1. PROFILES - Super admin can read/update all profiles
-- =====================================================================

DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
CREATE POLICY profiles_select_admin
  ON public.profiles
  FOR SELECT
  USING (
    fn_current_user_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
CREATE POLICY profiles_update_admin
  ON public.profiles
  FOR UPDATE
  USING (
    fn_current_user_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- =====================================================================
-- 2. CHURCH USER ROLES - Super admin can manage all church roles
-- =====================================================================

DROP POLICY IF EXISTS church_user_roles_select_platform_admin ON public.church_user_roles;
CREATE POLICY church_user_roles_select_platform_admin
  ON public.church_user_roles
  FOR SELECT
  USING (
    fn_current_user_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS church_user_roles_all_platform_admin ON public.church_user_roles;
CREATE POLICY church_user_roles_all_platform_admin
  ON public.church_user_roles
  FOR ALL
  USING (
    fn_current_user_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- =====================================================================
-- 3. PLATFORM ROLES - Super admin can manage platform roles
-- =====================================================================

DROP POLICY IF EXISTS platform_roles_select_admin ON public.platform_roles;
CREATE POLICY platform_roles_select_admin
  ON public.platform_roles
  FOR SELECT
  USING (
    fn_current_user_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS platform_roles_all_admin ON public.platform_roles;
CREATE POLICY platform_roles_all_admin
  ON public.platform_roles
  FOR ALL
  USING (
    fn_current_user_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- =====================================================================
-- 4. PRAYERS - Super admin can moderate all prayers
-- =====================================================================

DROP POLICY IF EXISTS prayers_select_platform_admin ON public.prayers;
CREATE POLICY prayers_select_platform_admin
  ON public.prayers
  FOR SELECT
  USING (
    fn_current_user_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS prayers_insert_member ON public.prayers;
CREATE POLICY prayers_insert_member
  ON public.prayers
  FOR INSERT
  WITH CHECK (
    fn_current_user_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.church_user_roles cur
      WHERE cur.user_id = auth.uid()
      AND cur.church_id = prayers.church_id
      AND cur.is_approved = true
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS prayers_update_platform_admin ON public.prayers;
CREATE POLICY prayers_update_platform_admin
  ON public.prayers
  FOR UPDATE
  USING (
    fn_current_user_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS prayers_delete_platform_admin ON public.prayers;
CREATE POLICY prayers_delete_platform_admin
  ON public.prayers
  FOR DELETE
  USING (
    fn_current_user_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- =====================================================================
-- 5. CHURCH PRIVATE LABELS - Super admin can manage all labels
-- =====================================================================

DROP POLICY IF EXISTS church_private_labels_select_admin ON public.church_private_labels;
CREATE POLICY church_private_labels_select_admin
  ON public.church_private_labels
  FOR SELECT
  USING (
    fn_current_user_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS church_private_labels_all_admin ON public.church_private_labels;
CREATE POLICY church_private_labels_all_admin
  ON public.church_private_labels
  FOR ALL
  USING (
    fn_current_user_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- =====================================================================
-- 6. COLLABORATION TAGS - Super admin can manage all tags
-- =====================================================================

DROP POLICY IF EXISTS collaboration_tags_all_admin ON public.collaboration_tags;
CREATE POLICY collaboration_tags_all_admin
  ON public.collaboration_tags
  FOR ALL
  USING (
    fn_current_user_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- =====================================================================
-- 7. CHURCHES - Super admin can update/delete any church
-- =====================================================================

DROP POLICY IF EXISTS churches_update_platform_admin ON public.churches;
CREATE POLICY churches_update_platform_admin
  ON public.churches
  FOR UPDATE
  USING (
    fn_current_user_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- Add delete policy for super admins
CREATE POLICY churches_delete_super_admin
  ON public.churches
  FOR DELETE
  USING (fn_current_user_is_super_admin());

-- =====================================================================
-- 8. AREAS - Super admin can manage all ministry areas
-- =====================================================================

DROP POLICY IF EXISTS areas_insert_platform_admin ON public.areas;
CREATE POLICY areas_insert_platform_admin
  ON public.areas
  FOR INSERT
  WITH CHECK (
    fn_current_user_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS areas_update_platform_admin ON public.areas;
CREATE POLICY areas_update_platform_admin
  ON public.areas
  FOR UPDATE
  USING (
    fn_current_user_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

DROP POLICY IF EXISTS areas_delete_platform_admin ON public.areas;
CREATE POLICY areas_delete_platform_admin
  ON public.areas
  FOR DELETE
  USING (
    fn_current_user_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- =====================================================================
-- 9. BOUNDARIES - Super admin can manage all boundaries
-- =====================================================================

-- Update boundaries select to allow super admin
DROP POLICY IF EXISTS boundaries_select_public ON public.boundaries;
CREATE POLICY boundaries_select_public
  ON public.boundaries
  FOR SELECT
  USING (true);  -- Public read already exists, no change needed

-- Add super admin write policies for boundaries
CREATE POLICY boundaries_insert_super_admin
  ON public.boundaries
  FOR INSERT
  WITH CHECK (fn_current_user_is_super_admin());

CREATE POLICY boundaries_update_super_admin
  ON public.boundaries
  FOR UPDATE
  USING (fn_current_user_is_super_admin());

CREATE POLICY boundaries_delete_super_admin
  ON public.boundaries
  FOR DELETE
  USING (fn_current_user_is_super_admin());

-- =====================================================================
-- 10. CALLINGS - Super admin can manage calling master list
-- =====================================================================

-- Super admin can insert/update/delete callings
CREATE POLICY callings_insert_super_admin
  ON public.callings
  FOR INSERT
  WITH CHECK (fn_current_user_is_super_admin());

CREATE POLICY callings_update_super_admin
  ON public.callings
  FOR UPDATE
  USING (fn_current_user_is_super_admin());

CREATE POLICY callings_delete_super_admin
  ON public.callings
  FOR DELETE
  USING (fn_current_user_is_super_admin());

-- =====================================================================
-- 11. CHURCH CALLING - Super admin can manage church-calling assignments
-- =====================================================================

CREATE POLICY church_calling_insert_super_admin
  ON public.church_calling
  FOR INSERT
  WITH CHECK (fn_current_user_is_super_admin());

CREATE POLICY church_calling_delete_super_admin
  ON public.church_calling
  FOR DELETE
  USING (fn_current_user_is_super_admin());

-- =====================================================================
-- SUCCESS MESSAGE
-- =====================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Super Admin RLS bypass policies created successfully!';
  RAISE NOTICE '🔓 Super admins can now bypass all RLS restrictions';
  RAISE NOTICE '📋 Next step: Set super_admin: true in user metadata';
END $$;
