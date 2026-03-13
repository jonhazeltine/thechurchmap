/**
 * Fix crime data jurisdiction issue
 * Tracts with 0 crimes are outside GR Police jurisdiction and should show as "no data"
 * This script updates those records to have null estimates instead of 0
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CRIME_METRICS = [
  'assault_rate',
  'sex_offense_rate', 
  'robbery_rate',
  'theft_rate',
  'burglary_rate',
  'vehicle_theft_rate',
  'vandalism_rate',
  'fraud_rate',
  'drug_offense_rate',
  'weapons_offense_rate',
  'violent_crime_rate',
  'property_crime_rate',
  'total_crime_rate'
];

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  console.log('Fixing crime data jurisdiction issue...');
  console.log('Tracts with 0 crimes are outside GR Police jurisdiction');
  console.log('Setting their estimates to NULL (no data)\n');

  // First, get the metric IDs for crime metrics
  const { data: metrics, error: metricsError } = await supabase
    .from('health_metrics')
    .select('id, metric_key')
    .in('metric_key', CRIME_METRICS);

  if (metricsError) {
    console.error('Error fetching metrics:', metricsError.message);
    return;
  }

  console.log(`Found ${metrics?.length || 0} crime metrics in database\n`);

  let totalUpdated = 0;

  for (const metric of metrics || []) {
    // Update records where estimate = 0 to have estimate = NULL
    const { data, error } = await supabase
      .from('health_metric_data')
      .update({ estimate: null })
      .eq('metric_id', metric.id)
      .eq('estimate', 0)
      .select('geo_fips');

    if (error) {
      console.error(`Error updating ${metric.metric_key}:`, error.message);
    } else {
      const count = data?.length || 0;
      totalUpdated += count;
      console.log(`${metric.metric_key}: Updated ${count} tracts to NULL`);
    }
  }

  console.log(`\nTotal: Updated ${totalUpdated} records`);
  console.log('Done! Zero-crime tracts will now show as grey "No Data" on the map.');
}

main().catch(console.error);
