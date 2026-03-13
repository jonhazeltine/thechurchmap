#!/usr/bin/env npx tsx
/**
 * Seed Data Source Configuration
 * 
 * Populates the data_source_config table with all known data sources:
 * - 56 crime sources (from crime-sources.ts)
 * - 1 CDC PLACES health source
 * - 1 Census ACS demographics source  
 * - 1 TIGERweb boundaries source (national)
 * - 1 OSM churches source (national)
 * 
 * Usage:
 *   npx tsx scripts/seed-data-source-config.ts
 *   npx tsx scripts/seed-data-source-config.ts --reset  # Clears and re-seeds
 */

import { createClient } from '@supabase/supabase-js';
import { ALL_ENDPOINTS } from './config/crime-sources';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const RESET_MODE = process.argv.includes('--reset');

interface DataSourceSeed {
  source_key: string;
  source_name: string;
  source_type: 'crime' | 'health' | 'demographics' | 'boundaries' | 'churches';
  source_category: string | null;
  enabled: boolean;
  cumulative_mode: boolean;
  frequency_label: 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly' | 'Manual';
  cron_expression: string | null;
  endpoint_url: string | null;
  city: string | null;
  state: string | null;
  requires_deduplication: boolean;
  requires_tract_assignment: boolean;
}

// Crime sources from crime-sources.ts
function getCrimeSources(): DataSourceSeed[] {
  const sources: DataSourceSeed[] = [];
  
  for (const endpoint of ALL_ENDPOINTS) {
    const cityName = endpoint.name; // All endpoints use 'name' property for city
    const sourceKey = `crime_${cityName.toLowerCase().replace(/\s+/g, '_')}`;
    const isCumulativeCity = ['Washington DC', 'Atlanta'].includes(cityName);
    
    // Get endpoint URL based on type
    let endpointUrl: string;
    if (endpoint.type === 'arcgis') {
      endpointUrl = endpoint.serviceUrl;
    } else if (endpoint.type === 'socrata') {
      endpointUrl = `https://${endpoint.domain}/resource/${endpoint.datasetId}.json`;
    } else if (endpoint.type === 'ckan') {
      endpointUrl = `${endpoint.domain}/api/3/action/datastore_search?resource_id=${endpoint.resourceId}`;
    } else if (endpoint.type === 'carto') {
      endpointUrl = endpoint.baseUrl;
    } else {
      endpointUrl = '';
    }
    
    sources.push({
      source_key: sourceKey,
      source_name: `${cityName}, ${endpoint.state} Crime Data`,
      source_type: 'crime',
      source_category: endpoint.type,
      enabled: true,
      cumulative_mode: isCumulativeCity,
      frequency_label: isCumulativeCity ? 'Daily' : 'Monthly',
      cron_expression: isCumulativeCity ? '0 3 * * *' : '0 2 1 * *', // Daily at 3 AM or Monthly on 1st
      endpoint_url: endpointUrl,
      city: cityName,
      state: endpoint.state,
      requires_deduplication: false,
      requires_tract_assignment: true,
    });
  }
  
  return sources;
}

// Health data source (CDC PLACES)
function getHealthSources(): DataSourceSeed[] {
  return [{
    source_key: 'cdc_places',
    source_name: 'CDC PLACES Health Data',
    source_type: 'health',
    source_category: 'cdc',
    enabled: true,
    cumulative_mode: false,
    frequency_label: 'Yearly',
    cron_expression: '0 2 15 1 *', // January 15th at 2 AM
    endpoint_url: 'https://data.cdc.gov/resource/cwsq-ngmh.json',
    city: null,
    state: null,
    requires_deduplication: false,
    requires_tract_assignment: false,
  }];
}

// Demographics data source (Census ACS)
function getDemographicsSources(): DataSourceSeed[] {
  return [{
    source_key: 'census_acs',
    source_name: 'Census ACS Demographics',
    source_type: 'demographics',
    source_category: 'census',
    enabled: true,
    cumulative_mode: false,
    frequency_label: 'Yearly',
    cron_expression: '0 2 1 12 *', // December 1st at 2 AM (after ACS release)
    endpoint_url: 'https://api.census.gov/data',
    city: null,
    state: null,
    requires_deduplication: false,
    requires_tract_assignment: false,
  }];
}

// Boundaries data source (TIGERweb)
function getBoundariesSources(): DataSourceSeed[] {
  return [{
    source_key: 'tigerweb_national',
    source_name: 'TIGERweb National Boundaries',
    source_type: 'boundaries',
    source_category: 'tigerweb',
    enabled: true,
    cumulative_mode: false,
    frequency_label: 'Yearly',
    cron_expression: '0 2 1 2 *', // February 1st at 2 AM (after TIGER release)
    endpoint_url: 'https://tigerweb.geo.census.gov/arcgis/rest/services',
    city: null,
    state: null,
    requires_deduplication: false,
    requires_tract_assignment: false,
  }];
}

// Churches data source (OSM)
function getChurchesSources(): DataSourceSeed[] {
  return [{
    source_key: 'osm_churches_national',
    source_name: 'OpenStreetMap Churches (National)',
    source_type: 'churches',
    source_category: 'osm',
    enabled: true,
    cumulative_mode: false,
    frequency_label: 'Quarterly',
    cron_expression: '0 2 1 */3 *', // Quarterly on the 1st at 2 AM
    endpoint_url: 'https://overpass-api.de/api/interpreter',
    city: null,
    state: null,
    requires_deduplication: true, // CRITICAL
    requires_tract_assignment: false,
  }];
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           DATA SOURCE CONFIGURATION SEEDER                    ║
╚══════════════════════════════════════════════════════════════╝
`);

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Gather all sources
  const allSources: DataSourceSeed[] = [
    ...getCrimeSources(),
    ...getHealthSources(),
    ...getDemographicsSources(),
    ...getBoundariesSources(),
    ...getChurchesSources(),
  ];

  console.log(`📊 Prepared ${allSources.length} data sources:`);
  console.log(`   - Crime: ${getCrimeSources().length}`);
  console.log(`   - Health: ${getHealthSources().length}`);
  console.log(`   - Demographics: ${getDemographicsSources().length}`);
  console.log(`   - Boundaries: ${getBoundariesSources().length}`);
  console.log(`   - Churches: ${getChurchesSources().length}`);

  if (RESET_MODE) {
    console.log('\n⚠️  RESET MODE: Clearing existing config...');
    const { error: deleteError } = await supabase
      .from('data_source_config')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deleteError) {
      console.error('Error clearing config:', deleteError.message);
    }
  }

  // Upsert sources (on conflict of source_key, update)
  console.log('\n📥 Inserting/updating data sources...\n');

  let inserted = 0;
  let updated = 0;
  let errors = 0;

  for (const source of allSources) {
    const { data, error } = await supabase
      .from('data_source_config')
      .upsert(source, {
        onConflict: 'source_key',
        ignoreDuplicates: false,
      })
      .select('id')
      .single();

    if (error) {
      console.error(`  ❌ ${source.source_key}: ${error.message}`);
      errors++;
    } else {
      const isUpdate = data?.id ? true : false;
      if (isUpdate) {
        updated++;
      } else {
        inserted++;
      }
      console.log(`  ✓ ${source.source_key}`);
    }
  }

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                      SUMMARY                                  ║
╠══════════════════════════════════════════════════════════════╣
║  Total sources:    ${allSources.length.toString().padStart(5)}                                    ║
║  Successful:       ${(inserted + updated).toString().padStart(5)}                                    ║
║  Errors:           ${errors.toString().padStart(5)}                                    ║
╚══════════════════════════════════════════════════════════════╝
`);

  // Verify totals
  const { count } = await supabase
    .from('data_source_config')
    .select('*', { count: 'exact', head: true });

  console.log(`📊 Total sources in database: ${count}`);
}

main().catch(console.error);
