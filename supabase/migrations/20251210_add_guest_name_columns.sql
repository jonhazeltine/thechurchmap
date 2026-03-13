-- Add guest_name column to post_comments table for guest comment support
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS guest_name TEXT;

-- Add status column to post_comments for moderation (pending, published, rejected)
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published';

-- Add guest_name column to prayer_interactions table for guest prayer support  
ALTER TABLE prayer_interactions ADD COLUMN IF NOT EXISTS guest_name TEXT;

-- Add answered prayer tracking columns
ALTER TABLE prayers ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ;
ALTER TABLE prayers ADD COLUMN IF NOT EXISTS answered_by_user_id UUID REFERENCES auth.users(id);
ALTER TABLE prayers ADD COLUMN IF NOT EXISTS answered_note TEXT;

-- Add index for guest comments moderation (finding pending guest comments)
CREATE INDEX IF NOT EXISTS idx_post_comments_guest_name ON post_comments(guest_name) WHERE guest_name IS NOT NULL;

-- Add index for pending comments moderation
CREATE INDEX IF NOT EXISTS idx_post_comments_status ON post_comments(status) WHERE status = 'pending';

-- Add index for guest prayer interactions
CREATE INDEX IF NOT EXISTS idx_prayer_interactions_guest_name ON prayer_interactions(guest_name) WHERE guest_name IS NOT NULL;

-- Add index for answered prayers
CREATE INDEX IF NOT EXISTS idx_prayers_answered ON prayers(answered_at) WHERE answered_at IS NOT NULL;
