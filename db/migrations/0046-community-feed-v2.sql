-- =====================================================================
-- COMMUNITY FEED V2: RICH TEXT & MEDIA SUPPORT
-- =====================================================================
-- Migration 0046: Add rich text and media asset support to posts and comments
-- Created: 2025-11-24
--
-- This migration adds:
-- - post_body_format enum for tracking content type (plain_text vs rich_text_json)
-- - body_format and rich_body columns to posts table for TipTap JSON content
-- - media_assets table for uploaded media (separate from URL-based media)
-- - Rich text support for comments (body_format and rich_body columns)
--
-- Dependencies: Requires posts, post_comments tables from migration 0032
-- =====================================================================

-- =====================================================================
-- BODY FORMAT ENUM
-- =====================================================================
-- Create enum to track whether content is plain text or rich text JSON
CREATE TYPE post_body_format AS ENUM ('plain_text', 'rich_text_json');

-- =====================================================================
-- POSTS TABLE: ADD RICH TEXT SUPPORT
-- =====================================================================
-- Add body_format column (default to plain_text for backward compatibility)
ALTER TABLE posts 
ADD COLUMN body_format post_body_format DEFAULT 'plain_text' NOT NULL;

-- Add rich_body column for TipTap JSON content
ALTER TABLE posts
ADD COLUMN rich_body JSONB;

-- Create index on body_format for efficient filtering
CREATE INDEX idx_posts_body_format ON posts(body_format);

-- =====================================================================
-- MEDIA ASSETS TABLE
-- =====================================================================
-- Table for uploaded media (separate from URL-based media)
-- Supports both images and videos with metadata
CREATE TABLE media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for efficient queries
CREATE INDEX idx_media_assets_post_id ON media_assets(post_id);
CREATE INDEX idx_media_assets_media_type ON media_assets(media_type);

-- =====================================================================
-- MEDIA ASSETS RLS POLICIES
-- =====================================================================
-- Enable Row Level Security
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view media assets for published posts
CREATE POLICY "Media assets viewable by all authenticated users"
  ON media_assets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM posts
      WHERE posts.id = media_assets.post_id
      AND posts.status = 'published'
    )
  );

-- Policy: Authenticated users can insert media assets only for their own posts
CREATE POLICY "Media assets insertable by authenticated users"
  ON media_assets FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = (SELECT author_id FROM posts WHERE id = media_assets.post_id)
  );

-- =====================================================================
-- POST COMMENTS: ADD RICH TEXT SUPPORT
-- =====================================================================
-- Add body_format column to comments (default to plain_text)
ALTER TABLE post_comments
ADD COLUMN body_format post_body_format DEFAULT 'plain_text' NOT NULL,
ADD COLUMN rich_body JSONB;

-- Create index on body_format for efficient filtering
CREATE INDEX idx_post_comments_body_format ON post_comments(body_format);

-- =====================================================================
-- VERIFICATION NOTES
-- =====================================================================
-- After running this migration:
-- 1. All existing posts will have body_format = 'plain_text' (backward compatible)
-- 2. New posts can use either 'plain_text' or 'rich_text_json' format
-- 3. Rich text content should be stored in rich_body as TipTap JSON
-- 4. Media assets are separate from inline media URLs
-- 5. RLS ensures only authenticated users can view/upload media
-- 6. Media assets cascade delete when associated post is deleted
-- =====================================================================
