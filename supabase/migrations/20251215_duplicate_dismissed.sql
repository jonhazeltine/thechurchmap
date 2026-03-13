-- Add duplicate_dismissed field to churches table
-- This allows admins to mark a church as "not a duplicate" when the system incorrectly flags it

ALTER TABLE churches
ADD COLUMN IF NOT EXISTS duplicate_dismissed BOOLEAN DEFAULT FALSE;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_churches_duplicate_dismissed 
ON churches(duplicate_dismissed) WHERE duplicate_dismissed = true;
