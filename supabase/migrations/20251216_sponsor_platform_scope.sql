-- Add city_platform_id to sponsors table to scope sponsors to specific platforms
ALTER TABLE sponsors ADD COLUMN IF NOT EXISTS city_platform_id uuid REFERENCES city_platforms(id) ON DELETE SET NULL;

-- Add platform_region_id to sponsor_assignments for regional sponsorships
ALTER TABLE sponsor_assignments ADD COLUMN IF NOT EXISTS platform_region_id uuid REFERENCES platform_regions(id) ON DELETE CASCADE;

-- Create index for faster lookups by platform
CREATE INDEX IF NOT EXISTS idx_sponsors_city_platform_id ON sponsors(city_platform_id);
CREATE INDEX IF NOT EXISTS idx_sponsor_assignments_platform_region_id ON sponsor_assignments(platform_region_id);
