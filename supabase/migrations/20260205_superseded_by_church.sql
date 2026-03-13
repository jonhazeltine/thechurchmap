-- Migration: Add superseded_by_church_id field to churches table
-- Purpose: Track when a bulk import church has been replaced by a platform-curated church
-- This allows the tileset generator to exclude superseded churches

-- Add superseded_by_church_id column
ALTER TABLE churches 
ADD COLUMN IF NOT EXISTS superseded_by_church_id UUID REFERENCES churches(id) ON DELETE SET NULL;

-- Add index for efficient lookups during tileset generation
CREATE INDEX IF NOT EXISTS idx_churches_superseded_by 
ON churches(superseded_by_church_id) 
WHERE superseded_by_church_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN churches.superseded_by_church_id IS 
'References the church that supersedes/replaces this record. Used to exclude obsolete bulk imports from tileset when a platform-curated version exists.';
