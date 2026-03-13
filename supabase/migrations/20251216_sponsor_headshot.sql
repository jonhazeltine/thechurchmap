-- Add headshot_url column to sponsors table for agent/lender profile photos
ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS headshot_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN sponsors.headshot_url IS 'URL for sponsor headshot/profile photo (optional)';
