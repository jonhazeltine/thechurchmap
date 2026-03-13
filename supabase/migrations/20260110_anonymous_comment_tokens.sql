-- Add anonymous token fields to post_comments for linking guest submissions to accounts
ALTER TABLE post_comments 
ADD COLUMN IF NOT EXISTS anonymous_token text,
ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;

-- Index for efficient token lookups during claim operations
CREATE INDEX IF NOT EXISTS idx_post_comments_anonymous_token 
ON post_comments (anonymous_token) 
WHERE anonymous_token IS NOT NULL;
