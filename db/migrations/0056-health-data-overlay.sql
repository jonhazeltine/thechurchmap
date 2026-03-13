-- Health Data Overlay System
-- Stores City Health Dashboard metrics and supports census tract boundaries

-- Health metric categories for organizing the 40+ metrics
CREATE TABLE IF NOT EXISTS public.health_metric_categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  color text,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Insert the 5 City Health Dashboard domains
INSERT INTO public.health_metric_categories (name, display_name, description, color, sort_order) VALUES
  ('clinical_care', 'Clinical Care', 'Access to healthcare and medical services', '#3B82F6', 1),
  ('health_behavior', 'Health Behavior', 'Personal health habits and lifestyle choices', '#10B981', 2),
  ('health_outcomes', 'Health Outcomes', 'Physical and mental health status indicators', '#EF4444', 3),
  ('physical_environment', 'Physical Environment', 'Environmental factors affecting health', '#8B5CF6', 4),
  ('social_economic', 'Social & Economic', 'Social determinants and economic factors', '#F59E0B', 5)
ON CONFLICT (name) DO NOTHING;

-- Health metrics definition table (the 40+ available metrics)
CREATE TABLE IF NOT EXISTS public.health_metrics (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  metric_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  category_id uuid REFERENCES public.health_metric_categories(id),
  description text,
  unit text,
  is_percentage boolean DEFAULT false,
  higher_is_better boolean,
  available_at_city boolean DEFAULT true,
  available_at_tract boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Health metric data values (the actual data points)
CREATE TABLE IF NOT EXISTS public.health_metric_data (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  metric_id uuid NOT NULL REFERENCES public.health_metrics(id) ON DELETE CASCADE,
  geo_fips text NOT NULL,
  geo_level text NOT NULL CHECK (geo_level IN ('city', 'tract')),
  geo_name text,
  state_fips text,
  state_abbr text,
  estimate numeric,
  lower_ci numeric,
  upper_ci numeric,
  numerator numeric,
  denominator numeric,
  data_period text,
  period_type text,
  source_name text,
  group_name text DEFAULT 'Total',
  census_year integer,
  version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metric_id, geo_fips, data_period, group_name)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_health_metric_data_geo_fips 
  ON public.health_metric_data (geo_fips);

CREATE INDEX IF NOT EXISTS idx_health_metric_data_metric_id 
  ON public.health_metric_data (metric_id);

CREATE INDEX IF NOT EXISTS idx_health_metric_data_geo_level 
  ON public.health_metric_data (geo_level);

CREATE INDEX IF NOT EXISTS idx_health_metric_data_metric_geo 
  ON public.health_metric_data (metric_id, geo_fips);

CREATE INDEX IF NOT EXISTS idx_health_metrics_category 
  ON public.health_metrics (category_id);

-- Update boundaries table to allow 'tract' type
ALTER TABLE public.boundaries DROP CONSTRAINT IF EXISTS boundaries_type_check;
ALTER TABLE public.boundaries ADD CONSTRAINT boundaries_type_check 
  CHECK (type IN ('county', 'city', 'zip', 'neighborhood', 'school_district', 'place', 'county_subdivision', 'tract', 'other'));

-- Also allow MultiPolygon for tract boundaries (some tracts have multiple parts)
-- This was likely already done in 0026 but ensure it exists
ALTER TABLE public.boundaries 
  ALTER COLUMN geometry TYPE geography(Geometry, 4326) 
  USING geometry::geography(Geometry, 4326);

-- RLS Policies for health data (read-only for all authenticated users)
ALTER TABLE public.health_metric_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_metric_data ENABLE ROW LEVEL SECURITY;

-- Everyone can read health data
CREATE POLICY "Anyone can read health categories"
  ON public.health_metric_categories FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read health metrics"
  ON public.health_metrics FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read health metric data"
  ON public.health_metric_data FOR SELECT
  USING (true);

-- Only super admins can modify health data
CREATE POLICY "Super admins can manage health categories"
  ON public.health_metric_categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can manage health metrics"
  ON public.health_metrics FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

CREATE POLICY "Super admins can manage health metric data"
  ON public.health_metric_data FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- RPC function to get health metrics with their latest data for a geographic area
CREATE OR REPLACE FUNCTION fn_get_health_metrics_for_area(
  p_geo_fips text,
  p_geo_level text DEFAULT 'city'
)
RETURNS TABLE (
  metric_id uuid,
  metric_key text,
  display_name text,
  category_name text,
  category_display_name text,
  category_color text,
  estimate numeric,
  lower_ci numeric,
  upper_ci numeric,
  data_period text,
  unit text,
  is_percentage boolean,
  higher_is_better boolean
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    hm.id as metric_id,
    hm.metric_key,
    hm.display_name,
    hmc.name as category_name,
    hmc.display_name as category_display_name,
    hmc.color as category_color,
    hmd.estimate,
    hmd.lower_ci,
    hmd.upper_ci,
    hmd.data_period,
    hm.unit,
    hm.is_percentage,
    hm.higher_is_better
  FROM public.health_metrics hm
  LEFT JOIN public.health_metric_categories hmc ON hm.category_id = hmc.id
  LEFT JOIN LATERAL (
    SELECT * FROM public.health_metric_data d
    WHERE d.metric_id = hm.id
      AND d.geo_fips = p_geo_fips
      AND d.geo_level = p_geo_level
      AND d.group_name = 'Total'
    ORDER BY d.data_period DESC
    LIMIT 1
  ) hmd ON true
  WHERE hmd.estimate IS NOT NULL
  ORDER BY hmc.sort_order, hm.display_name;
END;
$$;

-- RPC function to get tract-level data for a specific metric (for choropleth)
CREATE OR REPLACE FUNCTION fn_get_metric_tract_data(
  p_metric_key text,
  p_state_fips text DEFAULT NULL,
  p_parent_city_fips text DEFAULT NULL
)
RETURNS TABLE (
  geo_fips text,
  geo_name text,
  estimate numeric,
  lower_ci numeric,
  upper_ci numeric,
  data_period text
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (hmd.geo_fips)
    hmd.geo_fips,
    hmd.geo_name,
    hmd.estimate,
    hmd.lower_ci,
    hmd.upper_ci,
    hmd.data_period
  FROM public.health_metric_data hmd
  JOIN public.health_metrics hm ON hmd.metric_id = hm.id
  WHERE hm.metric_key = p_metric_key
    AND hmd.geo_level = 'tract'
    AND hmd.group_name = 'Total'
    AND (p_state_fips IS NULL OR hmd.state_fips = p_state_fips)
  ORDER BY hmd.geo_fips, hmd.data_period DESC;
END;
$$;
