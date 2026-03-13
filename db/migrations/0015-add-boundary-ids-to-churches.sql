-- Migration: Add boundary_ids column to churches table
-- Sprint 1.6: Enable churches to attach boundaries from the boundaries dataset

-- Add boundary_ids array column to churches table
ALTER TABLE churches 
ADD COLUMN IF NOT EXISTS boundary_ids uuid[] DEFAULT '{}';

-- Add index for faster queries on boundary_ids
CREATE INDEX IF NOT EXISTS idx_churches_boundary_ids ON churches USING GIN (boundary_ids);

-- Add comment
COMMENT ON COLUMN churches.boundary_ids IS 'Array of boundary UUIDs attached to this church (from boundaries table)';
