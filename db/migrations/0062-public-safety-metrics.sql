-- Public Safety Metrics (Crime Data from Grand Rapids Open Data)
-- This adds crime rate metrics aggregated to census tract level

-- Add Public Safety category
INSERT INTO public.health_metric_categories (name, display_name, description, color, sort_order) VALUES
  ('public_safety', 'Public Safety', 'Crime and safety indicators aggregated to census tract level', '#DC2626', 6)
ON CONFLICT (name) DO NOTHING;

-- Add crime metrics
INSERT INTO public.health_metrics (metric_key, display_name, category_id, description, unit, is_percentage, higher_is_better, available_at_city, available_at_tract) VALUES
  ('violent_crime_rate', 'Violent Crime Rate', 
   (SELECT id FROM public.health_metric_categories WHERE name = 'public_safety'),
   'Crimes against persons per 1,000 population (assault, sex offenses, etc.)', 
   'per 1,000', false, false, true, true),
  ('property_crime_rate', 'Property Crime Rate', 
   (SELECT id FROM public.health_metric_categories WHERE name = 'public_safety'),
   'Crimes against property per 1,000 population (theft, vandalism, motor vehicle theft, fraud)', 
   'per 1,000', false, false, true, true),
  ('total_crime_rate', 'Total Crime Rate', 
   (SELECT id FROM public.health_metric_categories WHERE name = 'public_safety'),
   'All reported crimes per 1,000 population', 
   'per 1,000', false, false, true, true)
ON CONFLICT (metric_key) DO NOTHING;

-- Add index on source_name for faster crime data queries
CREATE INDEX IF NOT EXISTS idx_health_metric_data_source 
  ON public.health_metric_data (source_name);

-- Add comment documenting the data source
COMMENT ON TABLE public.health_metric_data IS 'Health and safety metrics data. Crime data sourced from Grand Rapids Open Data (https://services2.arcgis.com/L81TiOwAPO1ZvU9b/arcgis/rest/services/CRIME_DALLLLLLL/FeatureServer/0) aggregated to census tracts using TIGERweb boundaries.';
