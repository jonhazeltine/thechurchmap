-- Migration: Add display_jw_churches setting to city_platforms
-- This allows platform owners to toggle visibility of Jehovah's Witness churches
-- Default is FALSE (hidden by default)

ALTER TABLE city_platforms 
ADD COLUMN IF NOT EXISTS display_jw_churches BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN city_platforms.display_jw_churches IS 'Whether to display Jehovah''s Witness churches on this platform. Filters churches with names containing "kingdom hall", "jehovah''s witness", "jehovah witness", "watchtower". Default is false (hidden).';
