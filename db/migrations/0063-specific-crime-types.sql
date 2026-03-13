-- Specific Crime Type Metrics (replacing aggregate categories)
-- This adds 10 specific crime rate metrics by NIBRS offense group

-- Delete old aggregate metrics and their data
DELETE FROM public.health_metric_data WHERE metric_id IN (
  SELECT id FROM public.health_metrics WHERE metric_key IN ('violent_crime_rate', 'property_crime_rate', 'total_crime_rate')
);
DELETE FROM public.health_metrics WHERE metric_key IN ('violent_crime_rate', 'property_crime_rate', 'total_crime_rate');

-- Add specific crime type metrics
INSERT INTO public.health_metrics (metric_key, display_name, category_id, description, unit, is_percentage, higher_is_better, available_at_city, available_at_tract) VALUES
  -- Crimes Against Persons
  ('assault_rate', 'Assault Rate', 
   (SELECT id FROM public.health_metric_categories WHERE name = 'public_safety'),
   'Assault offenses (simple and aggravated) per 1,000 population', 
   'per 1,000', false, false, true, true),
  ('sex_offense_rate', 'Sex Offense Rate', 
   (SELECT id FROM public.health_metric_categories WHERE name = 'public_safety'),
   'Sex offenses per 1,000 population', 
   'per 1,000', false, false, true, true),
  ('robbery_rate', 'Robbery Rate', 
   (SELECT id FROM public.health_metric_categories WHERE name = 'public_safety'),
   'Robbery offenses per 1,000 population', 
   'per 1,000', false, false, true, true),
  
  -- Crimes Against Property
  ('theft_rate', 'Theft Rate', 
   (SELECT id FROM public.health_metric_categories WHERE name = 'public_safety'),
   'Larceny and theft offenses per 1,000 population', 
   'per 1,000', false, false, true, true),
  ('burglary_rate', 'Burglary Rate', 
   (SELECT id FROM public.health_metric_categories WHERE name = 'public_safety'),
   'Burglary and breaking & entering per 1,000 population', 
   'per 1,000', false, false, true, true),
  ('vehicle_theft_rate', 'Vehicle Theft Rate', 
   (SELECT id FROM public.health_metric_categories WHERE name = 'public_safety'),
   'Motor vehicle theft per 1,000 population', 
   'per 1,000', false, false, true, true),
  ('vandalism_rate', 'Vandalism Rate', 
   (SELECT id FROM public.health_metric_categories WHERE name = 'public_safety'),
   'Property destruction and vandalism per 1,000 population', 
   'per 1,000', false, false, true, true),
  ('fraud_rate', 'Fraud Rate', 
   (SELECT id FROM public.health_metric_categories WHERE name = 'public_safety'),
   'Fraud offenses per 1,000 population', 
   'per 1,000', false, false, true, true),
  
  -- Crimes Against Society
  ('drug_offense_rate', 'Drug Offense Rate', 
   (SELECT id FROM public.health_metric_categories WHERE name = 'public_safety'),
   'Drug and narcotic offenses per 1,000 population', 
   'per 1,000', false, false, true, true),
  ('weapons_offense_rate', 'Weapons Offense Rate', 
   (SELECT id FROM public.health_metric_categories WHERE name = 'public_safety'),
   'Weapon law violations per 1,000 population', 
   'per 1,000', false, false, true, true)
ON CONFLICT (metric_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description;
