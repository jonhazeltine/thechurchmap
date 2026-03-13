-- =====================================================================
-- SPRINT 2.0 – ROW-LEVEL SECURITY (RLS) POLICIES
-- Migration: 0031-sprint-2-0-rls-policies.sql
-- =====================================================================
-- This migration creates RLS policies for Sprint 2.0 tables:
-- - profiles: users can read their own, admins can read all
-- - church_user_roles: users see their own, church admins see their church
-- - platform_roles: only platform admins can read
-- - prayers: public reads approved, admins moderate all
-- - church_private_labels: only platform admins can access
-- - collaboration_tags: public read, platform admins manage
-- - Update churches & areas policies for role-based editing
-- =====================================================================

-- =====================================================================
-- 1. PROFILES RLS
-- =====================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Platform admins can read all profiles
CREATE POLICY profiles_select_admin
  ON public.profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- Users can insert their own profile (on signup)
CREATE POLICY profiles_insert_own
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Platform admins can update any profile
CREATE POLICY profiles_update_admin
  ON public.profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- =====================================================================
-- 2. CHURCH USER ROLES RLS
-- =====================================================================
ALTER TABLE public.church_user_roles ENABLE ROW LEVEL SECURITY;

-- Users can see their own church roles
CREATE POLICY church_user_roles_select_own
  ON public.church_user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Church admins can see all roles for their church
CREATE POLICY church_user_roles_select_church_admin
  ON public.church_user_roles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.church_user_roles cur
      WHERE cur.user_id = auth.uid()
      AND cur.church_id = church_user_roles.church_id
      AND cur.role = 'church_admin'
      AND cur.is_approved = true
    )
  );

-- Platform admins can see all church user roles
CREATE POLICY church_user_roles_select_platform_admin
  ON public.church_user_roles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- Users can request membership (insert with role=member, is_approved=false)
CREATE POLICY church_user_roles_insert_member_request
  ON public.church_user_roles
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND role = 'member'
    AND is_approved = false
  );

-- Church admins can insert/update roles for their church
CREATE POLICY church_user_roles_update_church_admin
  ON public.church_user_roles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.church_user_roles cur
      WHERE cur.user_id = auth.uid()
      AND cur.church_id = church_user_roles.church_id
      AND cur.role = 'church_admin'
      AND cur.is_approved = true
    )
  );

-- Platform admins can manage all church user roles
CREATE POLICY church_user_roles_all_platform_admin
  ON public.church_user_roles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- =====================================================================
-- 3. PLATFORM ROLES RLS
-- =====================================================================
ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;

-- Only platform admins can read platform roles
CREATE POLICY platform_roles_select_admin
  ON public.platform_roles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- Only platform admins can insert/update/delete platform roles
CREATE POLICY platform_roles_all_admin
  ON public.platform_roles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- =====================================================================
-- 4. PRAYERS RLS
-- =====================================================================
ALTER TABLE public.prayers ENABLE ROW LEVEL SECURITY;

-- Public can read approved prayers
CREATE POLICY prayers_select_approved
  ON public.prayers
  FOR SELECT
  USING (status = 'approved');

-- Church admins can see all prayers for their church
CREATE POLICY prayers_select_church_admin
  ON public.prayers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.church_user_roles cur
      WHERE cur.user_id = auth.uid()
      AND cur.church_id = prayers.church_id
      AND cur.role = 'church_admin'
      AND cur.is_approved = true
    )
  );

-- Platform admins can see all prayers
CREATE POLICY prayers_select_platform_admin
  ON public.prayers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- Submitters can read their own prayers
CREATE POLICY prayers_select_own
  ON public.prayers
  FOR SELECT
  USING (auth.uid() = submitted_by_user_id);

-- Approved church members can insert prayers
CREATE POLICY prayers_insert_member
  ON public.prayers
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.church_user_roles cur
      WHERE cur.user_id = auth.uid()
      AND cur.church_id = prayers.church_id
      AND cur.is_approved = true
    )
    OR
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- Church admins can update prayers (moderate) for their church
CREATE POLICY prayers_update_church_admin
  ON public.prayers
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.church_user_roles cur
      WHERE cur.user_id = auth.uid()
      AND cur.church_id = prayers.church_id
      AND cur.role = 'church_admin'
      AND cur.is_approved = true
    )
  );

-- Platform admins can update any prayer
CREATE POLICY prayers_update_platform_admin
  ON public.prayers
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- Only platform admins can delete prayers
CREATE POLICY prayers_delete_platform_admin
  ON public.prayers
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- =====================================================================
-- 5. PRAYER INTERACTIONS RLS
-- =====================================================================
ALTER TABLE public.prayer_interactions ENABLE ROW LEVEL SECURITY;

-- Anyone can see prayer interactions for approved prayers
CREATE POLICY prayer_interactions_select_public
  ON public.prayer_interactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.prayers p
      WHERE p.id = prayer_interactions.prayer_id
      AND p.status = 'approved'
    )
  );

-- Authenticated users can insert interactions
CREATE POLICY prayer_interactions_insert_auth
  ON public.prayer_interactions
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Users can delete their own interactions
CREATE POLICY prayer_interactions_delete_own
  ON public.prayer_interactions
  FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================================
-- 6. CHURCH PRIVATE LABELS RLS
-- =====================================================================
ALTER TABLE public.church_private_labels ENABLE ROW LEVEL SECURITY;

-- Only platform admins can see private labels
CREATE POLICY church_private_labels_select_admin
  ON public.church_private_labels
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- Only platform admins can manage private labels
CREATE POLICY church_private_labels_all_admin
  ON public.church_private_labels
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- =====================================================================
-- 7. COLLABORATION TAGS RLS
-- =====================================================================
ALTER TABLE public.collaboration_tags ENABLE ROW LEVEL SECURITY;

-- Public can read active collaboration tags
CREATE POLICY collaboration_tags_select_public
  ON public.collaboration_tags
  FOR SELECT
  USING (true);

-- Only platform admins can insert/update/delete collaboration tags
CREATE POLICY collaboration_tags_all_admin
  ON public.collaboration_tags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- =====================================================================
-- 8. UPDATE EXISTING CHURCHES RLS FOR ROLE-BASED EDITING
-- =====================================================================

-- Drop old update policy if it exists
DROP POLICY IF EXISTS churches_update_owner ON public.churches;

-- Church admins can update their church
CREATE POLICY churches_update_church_admin
  ON public.churches
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.church_user_roles cur
      WHERE cur.user_id = auth.uid()
      AND cur.church_id = churches.id
      AND cur.role = 'church_admin'
      AND cur.is_approved = true
    )
  );

-- Platform admins can update any church
CREATE POLICY churches_update_platform_admin
  ON public.churches
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- =====================================================================
-- 9. UPDATE EXISTING AREAS RLS FOR ROLE-BASED EDITING
-- =====================================================================

-- Drop old insert/update policies
DROP POLICY IF EXISTS areas_insert_owner ON public.areas;
DROP POLICY IF EXISTS areas_update_owner ON public.areas;

-- Church admins can insert areas for their church
CREATE POLICY areas_insert_church_admin
  ON public.areas
  FOR INSERT
  WITH CHECK (
    church_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.church_user_roles cur
      WHERE cur.user_id = auth.uid()
      AND cur.church_id = areas.church_id
      AND cur.role = 'church_admin'
      AND cur.is_approved = true
    )
  );

-- Platform admins can insert any area
CREATE POLICY areas_insert_platform_admin
  ON public.areas
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- Church admins can update areas for their church
CREATE POLICY areas_update_church_admin
  ON public.areas
  FOR UPDATE
  USING (
    church_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.church_user_roles cur
      WHERE cur.user_id = auth.uid()
      AND cur.church_id = areas.church_id
      AND cur.role = 'church_admin'
      AND cur.is_approved = true
    )
  );

-- Platform admins can update any area
CREATE POLICY areas_update_platform_admin
  ON public.areas
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- Church admins can delete areas for their church
CREATE POLICY areas_delete_church_admin
  ON public.areas
  FOR DELETE
  USING (
    church_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.church_user_roles cur
      WHERE cur.user_id = auth.uid()
      AND cur.church_id = areas.church_id
      AND cur.role = 'church_admin'
      AND cur.is_approved = true
    )
  );

-- Platform admins can delete any area
CREATE POLICY areas_delete_platform_admin
  ON public.areas
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_roles pr
      WHERE pr.user_id = auth.uid()
      AND pr.role = 'platform_admin'
    )
  );

-- =====================================================================
-- SUCCESS MESSAGE
-- =====================================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Sprint 2.0 RLS policies created successfully!';
  RAISE NOTICE '🔒 All tables now have proper row-level security';
  RAISE NOTICE '📋 Next steps:';
  RAISE NOTICE '   1. Seed platform_roles with admin user IDs';
  RAISE NOTICE '   2. Test permissions with different user roles';
END $$;
