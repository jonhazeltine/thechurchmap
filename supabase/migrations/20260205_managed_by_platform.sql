-- Add managed_by_platform tracking field to churches table
-- This field is set to true when a church is first linked to any platform
-- Used to distinguish between:
-- 1. Pure bulk imports (never managed) - managed_by_platform = false
-- 2. Churches that were once on a platform but removed - managed_by_platform = true

ALTER TABLE churches ADD COLUMN IF NOT EXISTS managed_by_platform boolean DEFAULT false;

-- Backfill: Set managed_by_platform = true for all churches currently linked to any platform
UPDATE churches
SET managed_by_platform = true
WHERE id IN (
  SELECT DISTINCT church_id FROM city_platform_churches
);

-- Create index for faster filtering in tileset generation
CREATE INDEX IF NOT EXISTS idx_churches_managed_by_platform ON churches(managed_by_platform);
