-- Migration: Add display_lds_churches setting to city_platforms
-- This allows platform owners to toggle visibility of LDS/Mormon churches
-- Default is FALSE (hidden by default)

ALTER TABLE city_platforms 
ADD COLUMN IF NOT EXISTS display_lds_churches BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN city_platforms.display_lds_churches IS 'Whether to display LDS/Mormon churches on this platform. Filters churches with names containing "latter day saints", "lds", or "mormon". Default is false (hidden).';
