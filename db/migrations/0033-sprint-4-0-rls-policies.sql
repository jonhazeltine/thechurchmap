-- =====================================================================
-- SPRINT 4.0: RLS POLICIES FOR COMMUNITY FEED
-- =====================================================================
-- Migration 0033: Row Level Security policies for posts, comments, groups
-- Created: 2025-01-22
--
-- Permission Model:
-- - Posts: Public read (published), platform admin write
-- - Comments: Public read, approved users write, author/admin delete
-- - Groups: Public read, platform admin create (MVP: unused)
-- - Group Members: Admin only (MVP: unused)
-- =====================================================================

-- =====================================================================
-- ENABLE RLS ON NEW TABLES
-- =====================================================================
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- HELPER FUNCTIONS
-- =====================================================================

-- Check if current user is a platform admin
CREATE OR REPLACE FUNCTION auth.is_platform_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM platform_roles
    WHERE user_id = auth.uid()
      AND role = 'platform_admin'
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if current user is an approved church member
CREATE OR REPLACE FUNCTION auth.is_approved_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM church_user_roles
    WHERE user_id = auth.uid()
      AND is_approved = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- POSTS TABLE RLS POLICIES
-- =====================================================================

-- Anyone can read published posts
CREATE POLICY "posts_select_published"
  ON posts
  FOR SELECT
  USING (status = 'published');

-- Platform admins can insert posts
CREATE POLICY "posts_insert_platform_admin"
  ON posts
  FOR INSERT
  WITH CHECK (auth.is_platform_admin());

-- Platform admins can update any post
CREATE POLICY "posts_update_platform_admin"
  ON posts
  FOR UPDATE
  USING (auth.is_platform_admin())
  WITH CHECK (auth.is_platform_admin());

-- Platform admins can delete any post
CREATE POLICY "posts_delete_platform_admin"
  ON posts
  FOR DELETE
  USING (auth.is_platform_admin());

-- =====================================================================
-- POST_COMMENTS TABLE RLS POLICIES
-- =====================================================================

-- Anyone can read comments on published posts
CREATE POLICY "post_comments_select_public"
  ON post_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM posts
      WHERE posts.id = post_comments.post_id
        AND posts.status = 'published'
    )
  );

-- Approved users can insert comments
CREATE POLICY "post_comments_insert_approved"
  ON post_comments
  FOR INSERT
  WITH CHECK (
    auth.is_approved_user() OR auth.is_platform_admin()
  );

-- Comment authors can update their own comments
CREATE POLICY "post_comments_update_own"
  ON post_comments
  FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- Platform admins can update any comment
CREATE POLICY "post_comments_update_admin"
  ON post_comments
  FOR UPDATE
  USING (auth.is_platform_admin())
  WITH CHECK (auth.is_platform_admin());

-- Comment authors can delete their own comments
CREATE POLICY "post_comments_delete_own"
  ON post_comments
  FOR DELETE
  USING (author_id = auth.uid());

-- Platform admins can delete any comment
CREATE POLICY "post_comments_delete_admin"
  ON post_comments
  FOR DELETE
  USING (auth.is_platform_admin());

-- =====================================================================
-- GROUPS TABLE RLS POLICIES (Future expansion)
-- =====================================================================

-- Anyone can read public groups
CREATE POLICY "groups_select_public"
  ON groups
  FOR SELECT
  USING (visibility = 'public');

-- Platform admins can create groups (MVP)
CREATE POLICY "groups_insert_platform_admin"
  ON groups
  FOR INSERT
  WITH CHECK (auth.is_platform_admin());

-- Group creator or platform admin can update
CREATE POLICY "groups_update_creator_or_admin"
  ON groups
  FOR UPDATE
  USING (created_by = auth.uid() OR auth.is_platform_admin())
  WITH CHECK (created_by = auth.uid() OR auth.is_platform_admin());

-- Group creator or platform admin can delete
CREATE POLICY "groups_delete_creator_or_admin"
  ON groups
  FOR DELETE
  USING (created_by = auth.uid() OR auth.is_platform_admin());

-- =====================================================================
-- GROUP_MEMBERS TABLE RLS POLICIES (Future expansion)
-- =====================================================================

-- Group members can see other members in their group
CREATE POLICY "group_members_select_own_group"
  ON group_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
    )
    OR auth.is_platform_admin()
  );

-- Platform admins can add members (MVP)
CREATE POLICY "group_members_insert_platform_admin"
  ON group_members
  FOR INSERT
  WITH CHECK (auth.is_platform_admin());

-- Group admins or platform admins can update membership
CREATE POLICY "group_members_update_group_admin"
  ON group_members
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.role IN ('admin', 'moderator')
    )
    OR auth.is_platform_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.role IN ('admin', 'moderator')
    )
    OR auth.is_platform_admin()
  );

-- Users can leave groups (delete their own membership)
CREATE POLICY "group_members_delete_self"
  ON group_members
  FOR DELETE
  USING (user_id = auth.uid());

-- Group admins or platform admins can remove members
CREATE POLICY "group_members_delete_group_admin"
  ON group_members
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.role IN ('admin', 'moderator')
    )
    OR auth.is_platform_admin()
  );
