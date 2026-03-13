-- Migration: Add answered prayers columns and guest comment moderation
-- Run this in your Supabase SQL Editor

-- 1. Add answered prayer columns to prayers table
ALTER TABLE prayers 
ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS answered_by_user_id UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS answered_note TEXT;

-- 2. Add status column to post_comments for guest comment moderation
ALTER TABLE post_comments 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published';

-- 3. Add guest_name column to post_comments for guest commenters
ALTER TABLE post_comments 
ADD COLUMN IF NOT EXISTS guest_name TEXT;

-- 4. Make author_id nullable for guest comments
ALTER TABLE post_comments 
ALTER COLUMN author_id DROP NOT NULL;

-- 5. Create index for efficient querying of pending comments
CREATE INDEX IF NOT EXISTS idx_post_comments_status ON post_comments(status);

-- 6. Create index for answered prayers queries
CREATE INDEX IF NOT EXISTS idx_prayers_answered_at ON prayers(answered_at) WHERE answered_at IS NOT NULL;

-- 7. Update existing comments to have 'published' status if they don't have one
UPDATE post_comments SET status = 'published' WHERE status IS NULL;
