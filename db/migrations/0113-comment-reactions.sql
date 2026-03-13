-- =====================================================================
-- Comment Reactions Table
-- =====================================================================
-- Migration 0113: Create comment_reactions table for comment reactions
-- Created: 2026-01-17
--
-- This migration adds:
-- - comment_reactions: Reactions (like, celebrate) on post comments
-- =====================================================================

-- =====================================================================
-- COMMENT REACTIONS TABLE
-- =====================================================================
CREATE TABLE IF NOT EXISTS comment_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('like', 'pray', 'celebrate', 'support')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id, reaction_type)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_id ON comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_user_id ON comment_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_type ON comment_reactions(reaction_type);

-- =====================================================================
-- RLS POLICIES
-- =====================================================================
-- Enable RLS
ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;

-- Anyone can read reactions
CREATE POLICY "Anyone can read comment reactions" ON comment_reactions
FOR SELECT USING (true);

-- Authenticated users can insert their own reactions
CREATE POLICY "Users can insert their own reactions" ON comment_reactions
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can delete their own reactions
CREATE POLICY "Users can delete their own reactions" ON comment_reactions
FOR DELETE USING (auth.uid() = user_id);
