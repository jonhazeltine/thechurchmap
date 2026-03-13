-- Add anonymous token fields to prayers for linking guest submissions to accounts
ALTER TABLE prayers 
ADD COLUMN IF NOT EXISTS anonymous_token text,
ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;

-- Index for efficient token lookups during claim operations
CREATE INDEX IF NOT EXISTS idx_prayers_anonymous_token 
ON prayers (anonymous_token) 
WHERE anonymous_token IS NOT NULL;
