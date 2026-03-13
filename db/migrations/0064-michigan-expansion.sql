-- Michigan Statewide Expansion
-- Adds support for:
-- 1. Region-based feature toggles (enable/disable OSM churches by county)
-- 2. Church source tracking (manual vs OSM imported)
-- 3. Additional boundary types for statewide coverage

-- ============================================================================
-- REGION SETTINGS TABLE
-- Controls which regions (counties, ZIPs, custom areas) have OSM churches enabled
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.region_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_type text NOT NULL CHECK (region_type IN ('county', 'zip', 'custom', 'state')),
  region_id text NOT NULL, -- FIPS code for county, ZIP code, or custom ID
  region_name text NOT NULL,
  state_fips text DEFAULT '26', -- Michigan FIPS
  is_enabled boolean DEFAULT false,
  enabled_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region_type, region_id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_region_settings_enabled 
  ON public.region_settings (is_enabled) WHERE is_enabled = true;

CREATE INDEX IF NOT EXISTS idx_region_settings_type_id 
  ON public.region_settings (region_type, region_id);

-- RLS Policies
ALTER TABLE public.region_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read region settings
CREATE POLICY "Anyone can read region settings"
  ON public.region_settings FOR SELECT
  USING (true);

-- Only super admins can modify region settings (via user_metadata flag or platform_roles)
CREATE POLICY "Super admins can manage region settings"
  ON public.region_settings FOR ALL
  USING (
    -- Check user_metadata for super_admin flag
    (auth.jwt() -> 'user_metadata' ->> 'super_admin')::boolean = true
    OR
    -- Or check platform_roles table for platform_admin
    EXISTS (
      SELECT 1 FROM public.platform_roles
      WHERE platform_roles.user_id = auth.uid()
      AND platform_roles.role = 'platform_admin'
      AND platform_roles.is_active = true
    )
  );

-- ============================================================================
-- CHURCH SOURCE TRACKING
-- Adds columns to track where churches come from (manual entry vs OSM import)
-- ============================================================================

-- Add source tracking columns to churches table
ALTER TABLE public.churches 
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS county_fips text;

-- Add comments for documentation
COMMENT ON COLUMN public.churches.source IS 'Source of church data: manual, osm_mi_church, etc.';
COMMENT ON COLUMN public.churches.external_id IS 'External identifier from source system, e.g., osm:node/123456';
COMMENT ON COLUMN public.churches.county_fips IS '5-digit county FIPS code for region filtering';

-- Index for source filtering (to show only manual or only enabled OSM churches)
CREATE INDEX IF NOT EXISTS idx_churches_source 
  ON public.churches (source);

CREATE INDEX IF NOT EXISTS idx_churches_county_fips 
  ON public.churches (county_fips) WHERE county_fips IS NOT NULL;

-- Unique constraint for external_id within each source (prevents duplicate imports)
CREATE UNIQUE INDEX IF NOT EXISTS idx_churches_source_external_id 
  ON public.churches (source, external_id) 
  WHERE external_id IS NOT NULL;

-- ============================================================================
-- ADDITIONAL BOUNDARY TYPES
-- Remove strict type constraint to allow any boundary types (more flexible)
-- ============================================================================

ALTER TABLE public.boundaries DROP CONSTRAINT IF EXISTS boundaries_type_check;
-- Note: No longer enforcing strict type constraint - allows any boundary type

-- ============================================================================
-- SEED MICHIGAN COUNTIES
-- Pre-populate region_settings with all 83 Michigan counties (disabled by default)
-- ============================================================================

-- Michigan Counties with their FIPS codes
INSERT INTO public.region_settings (region_type, region_id, region_name, state_fips, is_enabled)
VALUES
  ('county', '26001', 'Alcona County', '26', false),
  ('county', '26003', 'Alger County', '26', false),
  ('county', '26005', 'Allegan County', '26', false),
  ('county', '26007', 'Alpena County', '26', false),
  ('county', '26009', 'Antrim County', '26', false),
  ('county', '26011', 'Arenac County', '26', false),
  ('county', '26013', 'Baraga County', '26', false),
  ('county', '26015', 'Barry County', '26', false),
  ('county', '26017', 'Bay County', '26', false),
  ('county', '26019', 'Benzie County', '26', false),
  ('county', '26021', 'Berrien County', '26', false),
  ('county', '26023', 'Branch County', '26', false),
  ('county', '26025', 'Calhoun County', '26', false),
  ('county', '26027', 'Cass County', '26', false),
  ('county', '26029', 'Charlevoix County', '26', false),
  ('county', '26031', 'Cheboygan County', '26', false),
  ('county', '26033', 'Chippewa County', '26', false),
  ('county', '26035', 'Clare County', '26', false),
  ('county', '26037', 'Clinton County', '26', false),
  ('county', '26039', 'Crawford County', '26', false),
  ('county', '26041', 'Delta County', '26', false),
  ('county', '26043', 'Dickinson County', '26', false),
  ('county', '26045', 'Eaton County', '26', false),
  ('county', '26047', 'Emmet County', '26', false),
  ('county', '26049', 'Genesee County', '26', false),
  ('county', '26051', 'Gladwin County', '26', false),
  ('county', '26053', 'Gogebic County', '26', false),
  ('county', '26055', 'Grand Traverse County', '26', false),
  ('county', '26057', 'Gratiot County', '26', false),
  ('county', '26059', 'Hillsdale County', '26', false),
  ('county', '26061', 'Houghton County', '26', false),
  ('county', '26063', 'Huron County', '26', false),
  ('county', '26065', 'Ingham County', '26', false),
  ('county', '26067', 'Ionia County', '26', false),
  ('county', '26069', 'Iosco County', '26', false),
  ('county', '26071', 'Iron County', '26', false),
  ('county', '26073', 'Isabella County', '26', false),
  ('county', '26075', 'Jackson County', '26', false),
  ('county', '26077', 'Kalamazoo County', '26', false),
  ('county', '26079', 'Kalkaska County', '26', false),
  ('county', '26081', 'Kent County', '26', true), -- Enable Kent County by default (current coverage)
  ('county', '26083', 'Keweenaw County', '26', false),
  ('county', '26085', 'Lake County', '26', false),
  ('county', '26087', 'Lapeer County', '26', false),
  ('county', '26089', 'Leelanau County', '26', false),
  ('county', '26091', 'Lenawee County', '26', false),
  ('county', '26093', 'Livingston County', '26', false),
  ('county', '26095', 'Luce County', '26', false),
  ('county', '26097', 'Mackinac County', '26', false),
  ('county', '26099', 'Macomb County', '26', false),
  ('county', '26101', 'Manistee County', '26', false),
  ('county', '26103', 'Marquette County', '26', false),
  ('county', '26105', 'Mason County', '26', false),
  ('county', '26107', 'Mecosta County', '26', false),
  ('county', '26109', 'Menominee County', '26', false),
  ('county', '26111', 'Midland County', '26', false),
  ('county', '26113', 'Missaukee County', '26', false),
  ('county', '26115', 'Monroe County', '26', false),
  ('county', '26117', 'Montcalm County', '26', false),
  ('county', '26119', 'Montmorency County', '26', false),
  ('county', '26121', 'Muskegon County', '26', false),
  ('county', '26123', 'Newaygo County', '26', false),
  ('county', '26125', 'Oakland County', '26', false),
  ('county', '26127', 'Oceana County', '26', false),
  ('county', '26129', 'Ogemaw County', '26', false),
  ('county', '26131', 'Ontonagon County', '26', false),
  ('county', '26133', 'Osceola County', '26', false),
  ('county', '26135', 'Oscoda County', '26', false),
  ('county', '26137', 'Otsego County', '26', false),
  ('county', '26139', 'Ottawa County', '26', false),
  ('county', '26141', 'Presque Isle County', '26', false),
  ('county', '26143', 'Roscommon County', '26', false),
  ('county', '26145', 'Saginaw County', '26', false),
  ('county', '26147', 'St. Clair County', '26', false),
  ('county', '26149', 'St. Joseph County', '26', false),
  ('county', '26151', 'Sanilac County', '26', false),
  ('county', '26153', 'Schoolcraft County', '26', false),
  ('county', '26155', 'Shiawassee County', '26', false),
  ('county', '26157', 'Tuscola County', '26', false),
  ('county', '26159', 'Van Buren County', '26', false),
  ('county', '26161', 'Washtenaw County', '26', false),
  ('county', '26163', 'Wayne County', '26', false),
  ('county', '26165', 'Wexford County', '26', false)
ON CONFLICT (region_type, region_id) DO UPDATE SET
  region_name = EXCLUDED.region_name,
  updated_at = now();

-- ============================================================================
-- RPC FUNCTION: Get churches with region filtering
-- Returns manual churches + OSM churches from enabled regions only
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_get_churches_with_region_filter(
  p_include_osm boolean DEFAULT true,
  p_bbox_west float8 DEFAULT NULL,
  p_bbox_south float8 DEFAULT NULL,
  p_bbox_east float8 DEFAULT NULL,
  p_bbox_north float8 DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  city text,
  state text,
  zip text,
  denomination text,
  website text,
  email text,
  phone text,
  latitude float8,
  longitude float8,
  profile_photo_url text,
  source text,
  county_fips text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.address,
    c.city,
    c.state,
    c.zip,
    c.denomination,
    c.website,
    c.email,
    c.phone,
    ST_Y(c.location::geometry) as latitude,
    ST_X(c.location::geometry) as longitude,
    c.profile_photo_url,
    c.source,
    c.county_fips
  FROM public.churches c
  WHERE c.approved = true
    -- Filter by bounding box if provided
    AND (
      p_bbox_west IS NULL OR p_bbox_south IS NULL OR p_bbox_east IS NULL OR p_bbox_north IS NULL
      OR ST_Intersects(
        c.location,
        ST_MakeEnvelope(p_bbox_west, p_bbox_south, p_bbox_east, p_bbox_north, 4326)::geography
      )
    )
    -- Include all manual churches, or OSM churches from enabled regions
    AND (
      c.source = 'manual' 
      OR c.source IS NULL
      OR (
        p_include_osm = true 
        AND EXISTS (
          SELECT 1 FROM public.region_settings rs
          WHERE rs.is_enabled = true
            AND rs.region_type = 'county'
            AND c.county_fips = rs.region_id
        )
      )
    )
  ORDER BY c.name;
END;
$$;

-- ============================================================================
-- RPC FUNCTION: Get enabled regions
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_get_enabled_regions(
  p_region_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  region_type text,
  region_id text,
  region_name text,
  is_enabled boolean,
  enabled_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rs.id,
    rs.region_type,
    rs.region_id,
    rs.region_name,
    rs.is_enabled,
    rs.enabled_at
  FROM public.region_settings rs
  WHERE rs.is_enabled = true
    AND (p_region_type IS NULL OR rs.region_type = p_region_type)
  ORDER BY rs.region_name;
END;
$$;

-- ============================================================================
-- RPC FUNCTION: Toggle region
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_toggle_region(
  p_region_id text,
  p_region_type text,
  p_is_enabled boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result json;
BEGIN
  UPDATE public.region_settings
  SET 
    is_enabled = p_is_enabled,
    enabled_at = CASE WHEN p_is_enabled THEN now() ELSE NULL END,
    updated_at = now()
  WHERE region_id = p_region_id
    AND region_type = p_region_type;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Region not found');
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'region_id', p_region_id,
    'is_enabled', p_is_enabled
  );
END;
$$;

-- ============================================================================
-- RPC FUNCTION: Find county for a point
-- Used by OSM ingestion script to assign county_fips via spatial join
-- ============================================================================

CREATE OR REPLACE FUNCTION find_county_for_point(
  lng float8,
  lat float8,
  state_fips text DEFAULT '26'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_county_fips text;
BEGIN
  -- Find the county boundary that contains this point
  SELECT b.external_id INTO v_county_fips
  FROM public.boundaries b
  WHERE b.type = 'county'
    AND b.external_id LIKE state_fips || '%'
    AND ST_Contains(
      b.geometry::geometry,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)
    )
  LIMIT 1;
  
  RETURN v_county_fips;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_get_churches_with_region_filter TO authenticated, anon;
GRANT EXECUTE ON FUNCTION fn_get_enabled_regions TO authenticated, anon;
GRANT EXECUTE ON FUNCTION fn_toggle_region TO authenticated;
GRANT EXECUTE ON FUNCTION find_county_for_point TO service_role;
