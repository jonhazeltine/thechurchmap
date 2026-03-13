-- Platform Regions: Named groupings of boundaries for city platforms
-- Allows platform admins to organize boundaries into meaningful regions like "Downtown", "East Side", etc.

-- Platform regions table
CREATE TABLE IF NOT EXISTS platform_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city_platform_id UUID NOT NULL REFERENCES city_platforms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6', -- Hex color for map display
  cover_image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_region_name_per_platform UNIQUE (city_platform_id, name)
);

-- Region boundaries join table (allows overlapping regions)
CREATE TABLE IF NOT EXISTS region_boundaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES platform_regions(id) ON DELETE CASCADE,
  boundary_id UUID NOT NULL REFERENCES boundaries(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_boundary_per_region UNIQUE (region_id, boundary_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_platform_regions_platform ON platform_regions(city_platform_id);
CREATE INDEX IF NOT EXISTS idx_platform_regions_sort ON platform_regions(city_platform_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_region_boundaries_region ON region_boundaries(region_id);
CREATE INDEX IF NOT EXISTS idx_region_boundaries_boundary ON region_boundaries(boundary_id);

-- Enable RLS
ALTER TABLE platform_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE region_boundaries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for platform_regions

-- Anyone can read regions for public platforms
CREATE POLICY "Anyone can view regions for public platforms"
  ON platform_regions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM city_platforms cp 
      WHERE cp.id = platform_regions.city_platform_id 
      AND cp.is_public = true
    )
  );

-- Platform admins can manage regions
CREATE POLICY "Platform admins can manage regions"
  ON platform_regions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
      AND cpu.is_active = true
      AND (
        cpu.role = 'super_admin'
        OR (cpu.city_platform_id = platform_regions.city_platform_id 
            AND cpu.role IN ('platform_owner', 'platform_admin'))
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM city_platform_users cpu
      WHERE cpu.user_id = auth.uid()
      AND cpu.is_active = true
      AND (
        cpu.role = 'super_admin'
        OR (cpu.city_platform_id = platform_regions.city_platform_id 
            AND cpu.role IN ('platform_owner', 'platform_admin'))
      )
    )
  );

-- RLS Policies for region_boundaries

-- Anyone can read region boundaries for public platforms
CREATE POLICY "Anyone can view region boundaries for public platforms"
  ON region_boundaries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM platform_regions preg
      JOIN city_platforms cp ON cp.id = preg.city_platform_id
      WHERE preg.id = region_boundaries.region_id
      AND cp.is_public = true
    )
  );

-- Platform admins can manage region boundaries
CREATE POLICY "Platform admins can manage region boundaries"
  ON region_boundaries FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_regions preg
      JOIN city_platform_users cpu ON cpu.user_id = auth.uid() AND cpu.is_active = true
      WHERE preg.id = region_boundaries.region_id
      AND (
        cpu.role = 'super_admin'
        OR (cpu.city_platform_id = preg.city_platform_id 
            AND cpu.role IN ('platform_owner', 'platform_admin'))
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_regions preg
      JOIN city_platform_users cpu ON cpu.user_id = auth.uid() AND cpu.is_active = true
      WHERE preg.id = region_boundaries.region_id
      AND (
        cpu.role = 'super_admin'
        OR (cpu.city_platform_id = preg.city_platform_id 
            AND cpu.role IN ('platform_owner', 'platform_admin'))
      )
    )
  );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_platform_regions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER platform_regions_updated_at
  BEFORE UPDATE ON platform_regions
  FOR EACH ROW
  EXECUTE FUNCTION update_platform_regions_updated_at();

-- Function to get regions with church counts for a platform
-- Uses spatial queries to count churches within region boundaries
CREATE OR REPLACE FUNCTION fn_get_platform_regions_with_counts(p_platform_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  color TEXT,
  cover_image_url TEXT,
  sort_order INTEGER,
  boundary_count BIGINT,
  church_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pr.id,
    pr.name,
    pr.color,
    pr.cover_image_url,
    pr.sort_order,
    COUNT(DISTINCT rb.boundary_id) as boundary_count,
    (
      SELECT COUNT(DISTINCT c.id)
      FROM churches c
      JOIN city_platform_churches cpc ON cpc.church_id = c.id 
        AND cpc.city_platform_id = p_platform_id
        AND cpc.status IN ('visible', 'featured')
      WHERE EXISTS (
        SELECT 1 
        FROM region_boundaries rb2
        JOIN boundaries b ON b.id = rb2.boundary_id
        WHERE rb2.region_id = pr.id
        AND ST_Intersects(c.location::geometry, b.geometry::geometry)
      )
    ) as church_count
  FROM platform_regions pr
  LEFT JOIN region_boundaries rb ON rb.region_id = pr.id
  WHERE pr.city_platform_id = p_platform_id
  GROUP BY pr.id, pr.name, pr.color, pr.cover_image_url, pr.sort_order
  ORDER BY pr.sort_order, pr.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE platform_regions IS 'Named groupings of boundaries for city platforms (e.g., Downtown, East Side)';
COMMENT ON TABLE region_boundaries IS 'Join table linking regions to their constituent boundaries (allows overlapping)';
COMMENT ON FUNCTION fn_get_platform_regions_with_counts IS 'Returns regions for a platform with boundary and church counts';
