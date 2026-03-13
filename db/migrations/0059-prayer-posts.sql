-- =====================================================================
-- PRAYER POSTS: COMMUNITY-PRAYER INTEGRATION
-- =====================================================================
-- Migration 0059: Add prayer post type and related structures
-- Created: 2025-11-27
--
-- This migration adds:
-- - post_type enum (general, prayer_post) for distinguishing post types
-- - post_type column to posts table
-- - linked_church_id column for prayer posts (distinct from church_id which is for tagging)
-- - last_activity_at for feed ordering by recent activity
-- - cover_image_url for custom prayer post graphics
-- - comment_type enum for distinguishing comment types
-- - Extensions to post_comments for prayer responses
-- - Unique constraint ensuring one prayer post per church
--
-- Dependencies: Requires posts, post_comments, churches, prayers tables
-- =====================================================================

-- =====================================================================
-- POST TYPE ENUM
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'post_type') THEN
    CREATE TYPE post_type AS ENUM ('general', 'prayer_post');
  END IF;
END$$;

-- =====================================================================
-- COMMENT TYPE ENUM
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'comment_type') THEN
    CREATE TYPE comment_type AS ENUM ('standard', 'prayer_tap', 'encouragement');
  END IF;
END$$;

-- =====================================================================
-- POSTS TABLE EXTENSIONS
-- =====================================================================

-- Add post_type column with default 'general'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'posts' AND column_name = 'post_type'
  ) THEN
    ALTER TABLE posts ADD COLUMN post_type post_type NOT NULL DEFAULT 'general';
  END IF;
END$$;

-- Add linked_church_id for prayer posts (the church this prayer post belongs to)
-- This is different from church_id which is for tagging posts about a church
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'posts' AND column_name = 'linked_church_id'
  ) THEN
    ALTER TABLE posts ADD COLUMN linked_church_id UUID REFERENCES churches(id) ON DELETE CASCADE;
  END IF;
END$$;

-- Add last_activity_at for feed ordering (updated when comments are added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'posts' AND column_name = 'last_activity_at'
  ) THEN
    ALTER TABLE posts ADD COLUMN last_activity_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END$$;

-- Add cover_image_url for prayer post custom graphics
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'posts' AND column_name = 'cover_image_url'
  ) THEN
    ALTER TABLE posts ADD COLUMN cover_image_url TEXT;
  END IF;
END$$;

-- Initialize last_activity_at for existing posts
UPDATE posts SET last_activity_at = created_at WHERE last_activity_at IS NULL;

-- Create index for feed ordering by activity
CREATE INDEX IF NOT EXISTS idx_posts_last_activity_at ON posts(last_activity_at DESC);

-- Create index for finding prayer posts by church
CREATE INDEX IF NOT EXISTS idx_posts_linked_church_id ON posts(linked_church_id) WHERE linked_church_id IS NOT NULL;

-- Create index for post_type queries
CREATE INDEX IF NOT EXISTS idx_posts_post_type ON posts(post_type);

-- Unique constraint: only one prayer_post per church
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_prayer_post_per_church 
ON posts(linked_church_id) 
WHERE post_type = 'prayer_post' AND linked_church_id IS NOT NULL;

-- =====================================================================
-- POST COMMENTS TABLE EXTENSIONS
-- =====================================================================

-- Add comment_type column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'post_comments' AND column_name = 'comment_type'
  ) THEN
    ALTER TABLE post_comments ADD COLUMN comment_type comment_type NOT NULL DEFAULT 'standard';
  END IF;
END$$;

-- Add display_name for anonymous prayer taps (when user not logged in)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'post_comments' AND column_name = 'display_name'
  ) THEN
    ALTER TABLE post_comments ADD COLUMN display_name TEXT;
  END IF;
END$$;

-- Add prayer_id to link back to the original prayer that was tapped
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'post_comments' AND column_name = 'prayer_id'
  ) THEN
    ALTER TABLE post_comments ADD COLUMN prayer_id UUID REFERENCES prayers(id) ON DELETE SET NULL;
  END IF;
END$$;

-- Add status column if not exists (for moderation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'post_comments' AND column_name = 'status'
  ) THEN
    ALTER TABLE post_comments ADD COLUMN status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'removed', 'pending'));
  END IF;
END$$;

-- Create index for prayer_id lookups
CREATE INDEX IF NOT EXISTS idx_post_comments_prayer_id ON post_comments(prayer_id) WHERE prayer_id IS NOT NULL;

-- Create index for comment_type queries
CREATE INDEX IF NOT EXISTS idx_post_comments_comment_type ON post_comments(comment_type);

-- =====================================================================
-- TRIGGER: UPDATE last_activity_at ON NEW COMMENTS
-- =====================================================================
CREATE OR REPLACE FUNCTION update_post_last_activity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE posts 
  SET last_activity_at = NOW() 
  WHERE id = NEW.post_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_update_post_last_activity ON post_comments;

CREATE TRIGGER trigger_update_post_last_activity
  AFTER INSERT ON post_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_post_last_activity();

-- =====================================================================
-- RPC FUNCTION: GET OR CREATE PRAYER POST
-- =====================================================================
CREATE OR REPLACE FUNCTION get_or_create_prayer_post(
  p_church_id UUID,
  p_system_user_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_post_id UUID;
  v_church_name TEXT;
  v_author_id UUID;
BEGIN
  -- Check if prayer post already exists for this church
  SELECT id INTO v_post_id
  FROM posts
  WHERE linked_church_id = p_church_id AND post_type = 'prayer_post'
  LIMIT 1;
  
  IF v_post_id IS NOT NULL THEN
    RETURN v_post_id;
  END IF;
  
  -- Get church name for the post title
  SELECT name INTO v_church_name
  FROM churches
  WHERE id = p_church_id;
  
  IF v_church_name IS NULL THEN
    RAISE EXCEPTION 'Church not found: %', p_church_id;
  END IF;
  
  -- Use provided system user or find church admin
  IF p_system_user_id IS NOT NULL THEN
    v_author_id := p_system_user_id;
  ELSE
    -- Try to find a church admin for this church
    SELECT user_id INTO v_author_id
    FROM church_user_roles
    WHERE church_id = p_church_id AND role = 'church_admin' AND is_approved = true
    LIMIT 1;
    
    -- If no admin, find any approved member
    IF v_author_id IS NULL THEN
      SELECT user_id INTO v_author_id
      FROM church_user_roles
      WHERE church_id = p_church_id AND is_approved = true
      LIMIT 1;
    END IF;
    
    -- If still no author, we need a system user
    IF v_author_id IS NULL THEN
      RAISE EXCEPTION 'No author available for prayer post creation. Provide p_system_user_id.';
    END IF;
  END IF;
  
  -- Create the prayer post
  INSERT INTO posts (
    author_id,
    post_type,
    linked_church_id,
    title,
    body,
    status,
    last_activity_at
  ) VALUES (
    v_author_id,
    'prayer_post',
    p_church_id,
    'Prayer Focus: ' || v_church_name,
    'Join us in lifting up ' || v_church_name || ' in prayer. Every prayer matters, and together we can make a difference in our community.',
    'published',
    NOW()
  )
  RETURNING id INTO v_post_id;
  
  RETURN v_post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- RPC FUNCTION: ADD PRAYER RESPONSE COMMENT
-- =====================================================================
CREATE OR REPLACE FUNCTION add_prayer_response(
  p_post_id UUID,
  p_comment_type comment_type,
  p_body TEXT,
  p_display_name TEXT DEFAULT NULL,
  p_author_id UUID DEFAULT NULL,
  p_prayer_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_comment_id UUID;
  v_effective_author_id UUID;
BEGIN
  -- Use provided author or get from auth context
  v_effective_author_id := COALESCE(p_author_id, auth.uid());
  
  -- If no author and this is a prayer_tap, that's okay (anonymous)
  -- But we need a display_name for anonymous posts
  IF v_effective_author_id IS NULL AND p_comment_type = 'prayer_tap' THEN
    IF p_display_name IS NULL OR p_display_name = '' THEN
      -- No name provided, don't create comment (silent tap)
      RETURN NULL;
    END IF;
  END IF;
  
  -- For encouragements, require an author
  IF v_effective_author_id IS NULL AND p_comment_type = 'encouragement' THEN
    RAISE EXCEPTION 'Encouragements require a logged-in user';
  END IF;
  
  -- Insert the comment
  INSERT INTO post_comments (
    post_id,
    author_id,
    body,
    comment_type,
    display_name,
    prayer_id,
    status
  ) VALUES (
    p_post_id,
    v_effective_author_id,
    p_body,
    p_comment_type,
    p_display_name,
    p_prayer_id,
    'published'
  )
  RETURNING id INTO v_comment_id;
  
  RETURN v_comment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- RLS POLICIES FOR PRAYER POSTS
-- =====================================================================

-- Update posts RLS to allow viewing prayer posts
DROP POLICY IF EXISTS "Prayer posts viewable by all" ON posts;
CREATE POLICY "Prayer posts viewable by all"
  ON posts FOR SELECT
  USING (post_type = 'prayer_post' AND status = 'published');

-- Allow church admins to update their church's prayer post
DROP POLICY IF EXISTS "Church admins can update prayer posts" ON posts;
CREATE POLICY "Church admins can update prayer posts"
  ON posts FOR UPDATE
  TO authenticated
  USING (
    post_type = 'prayer_post' 
    AND linked_church_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM church_user_roles cur
      WHERE cur.church_id = posts.linked_church_id
      AND cur.user_id = auth.uid()
      AND cur.role IN ('church_admin')
      AND cur.is_approved = true
    )
  );

-- =====================================================================
-- VERIFICATION NOTES
-- =====================================================================
-- After running this migration:
-- 1. posts table has post_type (general/prayer_post) column
-- 2. posts table has linked_church_id for prayer posts
-- 3. posts table has last_activity_at for feed ordering
-- 4. posts table has cover_image_url for custom graphics
-- 5. post_comments has comment_type (standard/prayer_tap/encouragement)
-- 6. post_comments has display_name for anonymous prayers
-- 7. post_comments has prayer_id to link back to tapped prayers
-- 8. Trigger updates last_activity_at when comments are added
-- 9. get_or_create_prayer_post RPC creates prayer posts as needed
-- 10. add_prayer_response RPC adds prayer comments
-- =====================================================================
