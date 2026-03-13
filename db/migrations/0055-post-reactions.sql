-- =====================================================================
-- COMMUNITY FEED V3: POST REACTIONS & PROFILE AVATARS
-- =====================================================================
-- Migration 0055: Add reactions system and profile avatars
-- Created: 2025-11-26
--
-- This migration adds:
-- - reaction_type enum for types of reactions (like, pray, celebrate, support)
-- - post_reactions table for storing user reactions on posts
-- - avatar_url column to profiles table
--
-- Dependencies: Requires posts, profiles tables from prior migrations
-- =====================================================================

-- =====================================================================
-- REACTION TYPE ENUM
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reaction_type') THEN
    CREATE TYPE reaction_type AS ENUM ('like', 'pray', 'celebrate', 'support');
  END IF;
END$$;

-- =====================================================================
-- POST REACTIONS TABLE
-- =====================================================================
CREATE TABLE IF NOT EXISTS post_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction_type reaction_type NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  -- Each user can only have one reaction of each type per post
  UNIQUE(post_id, user_id, reaction_type)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_post_reactions_post_id ON post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_user_id ON post_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_type ON post_reactions(reaction_type);

-- =====================================================================
-- POST REACTIONS RLS POLICIES
-- =====================================================================
ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone authenticated can view reactions
CREATE POLICY "Reactions viewable by all authenticated users"
  ON post_reactions FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Authenticated users can insert their own reactions
CREATE POLICY "Users can add their own reactions"
  ON post_reactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Authenticated users can delete their own reactions
CREATE POLICY "Users can remove their own reactions"
  ON post_reactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- =====================================================================
-- PROFILE AVATAR URL
-- =====================================================================
-- Add avatar_url column to profiles table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE profiles ADD COLUMN avatar_url TEXT;
  END IF;
END$$;

-- =====================================================================
-- RPC FUNCTION: GET REACTION COUNTS
-- =====================================================================
CREATE OR REPLACE FUNCTION get_post_reaction_counts(p_post_id UUID)
RETURNS TABLE (
  reaction_type TEXT,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pr.reaction_type::TEXT,
    COUNT(*)::BIGINT
  FROM post_reactions pr
  WHERE pr.post_id = p_post_id
  GROUP BY pr.reaction_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- RPC FUNCTION: GET USER REACTIONS FOR POST
-- =====================================================================
CREATE OR REPLACE FUNCTION get_user_post_reactions(p_post_id UUID, p_user_id UUID)
RETURNS TEXT[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT pr.reaction_type::TEXT
    FROM post_reactions pr
    WHERE pr.post_id = p_post_id AND pr.user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- RPC FUNCTION: TOGGLE REACTION
-- =====================================================================
CREATE OR REPLACE FUNCTION toggle_post_reaction(
  p_post_id UUID,
  p_user_id UUID,
  p_reaction_type reaction_type
)
RETURNS BOOLEAN AS $$
DECLARE
  reaction_exists BOOLEAN;
BEGIN
  -- Check if reaction already exists
  SELECT EXISTS(
    SELECT 1 FROM post_reactions 
    WHERE post_id = p_post_id 
    AND user_id = p_user_id 
    AND reaction_type = p_reaction_type
  ) INTO reaction_exists;
  
  IF reaction_exists THEN
    -- Remove the reaction
    DELETE FROM post_reactions 
    WHERE post_id = p_post_id 
    AND user_id = p_user_id 
    AND reaction_type = p_reaction_type;
    RETURN FALSE; -- Reaction was removed
  ELSE
    -- Add the reaction
    INSERT INTO post_reactions (post_id, user_id, reaction_type)
    VALUES (p_post_id, p_user_id, p_reaction_type);
    RETURN TRUE; -- Reaction was added
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- VERIFICATION NOTES
-- =====================================================================
-- After running this migration:
-- 1. post_reactions table stores user reactions on posts
-- 2. Each user can have multiple reaction types per post (like AND pray, etc.)
-- 3. RLS ensures users can only manage their own reactions
-- 4. RPC functions enable efficient reaction counting and toggling
-- 5. avatar_url added to profiles for displaying user avatars
-- =====================================================================
