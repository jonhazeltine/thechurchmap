#!/usr/bin/env npx tsx
/**
 * Census ACS Population Ingestion Script
 * 
 * Fetches tract-level total population from Census ACS API for all states
 * with crime data. This is required to calculate crime rates per 100k population.
 * 
 * API Endpoint: https://api.census.gov/data/2022/acs/acs5
 * Variable: B01003_001E (Total Population)
 * 
 * Usage:
 *   npx tsx scripts/ingest-census-population.ts
 *   npx tsx scripts/ingest-census-population.ts --state MI
 *   npx tsx scripts/ingest-census-population.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js';

const CENSUS_ACS_BASE = 'https://api.census.gov/data/2022/acs/acs5';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const censusApiKey = process.env.CENSUS_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// State FIPS codes for all states with crime data
const STATE_FIPS: Record<string, string> = {
  'AL': '01', 'AK': '02', 'AZ': '04', 'AR': '05', 'CA': '06',
  'CO': '08', 'CT': '09', 'DE': '10', 'DC': '11', 'FL': '12',
  'GA': '13', 'HI': '15', 'ID': '16', 'IL': '17', 'IN': '18',
  'IA': '19', 'KS': '20', 'KY': '21', 'LA': '22', 'ME': '23',
  'MD': '24', 'MA': '25', 'MI': '26', 'MN': '27', 'MS': '28',
  'MO': '29', 'MT': '30', 'NE': '31', 'NV': '32', 'NH': '33',
  'NJ': '34', 'NM': '35', 'NY': '36', 'NC': '37', 'ND': '38',
  'OH': '39', 'OK': '40', 'OR': '41', 'PA': '42', 'RI': '44',
  'SC': '45', 'SD': '46', 'TN': '47', 'TX': '48', 'UT': '49',
  'VT': '50', 'VA': '51', 'WA': '53', 'WV': '54', 'WI': '55',
  'WY': '56',
};

// Reverse lookup for state abbreviations
const FIPS_TO_STATE: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_FIPS).map(([abbr, fips]) => [fips, abbr])
);

interface TractPopulation {
  geoFips: string;
  tractName: string;
  stateFips: string;
  stateAbbr: string;
  population: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchStatePopulation(stateFips: string): Promise<TractPopulation[]> {
  const stateAbbr = FIPS_TO_STATE[stateFips] || 'XX';
  
  let url = `${CENSUS_ACS_BASE}?get=NAME,B01003_001E&for=tract:*&in=state:${stateFips}`;
  if (censusApiKey) {
    url += `&key=${censusApiKey}`;
  }
  
  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`  API error for state ${stateAbbr}: ${response.status} - ${errorText.substring(0, 100)}`);
    return [];
  }
  
  const data = await response.json();
  const results: TractPopulation[] = [];
  
  // First row is headers
  const headers = data[0];
  const nameIdx = headers.indexOf('NAME');
  const popIdx = headers.indexOf('B01003_001E');
  const stateIdx = headers.indexOf('state');
  const countyIdx = headers.indexOf('county');
  const tractIdx = headers.indexOf('tract');
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const population = parseInt(row[popIdx], 10);
    
    if (isNaN(population) || population < 0) continue;
    
    const geoFips = `${row[stateIdx]}${row[countyIdx]}${row[tractIdx]}`;
    
    results.push({
      geoFips,
      tractName: row[nameIdx] || `Tract ${geoFips}`,
      stateFips: row[stateIdx],
      stateAbbr,
      population,
    });
  }
  
  return results;
}

async function getOrCreatePopulationMetric(): Promise<string> {
  // Check if total_population metric exists
  const { data: existing } = await supabase
    .from('health_metrics')
    .select('id')
    .eq('metric_key', 'total_population')
    .single();
  
  if (existing) {
    return existing.id;
  }
  
  // Get the social_economic category (should already exist)
  const { data: category } = await supabase
    .from('health_metric_categories')
    .select('id')
    .eq('name', 'social_economic')
    .single();
  
  if (!category) {
    throw new Error('social_economic category not found. Please ensure health_metric_categories is populated.');
  }
  
  // Create the total_population metric
  const { data: newMetric, error: metricError } = await supabase
    .from('health_metrics')
    .insert({
      metric_key: 'total_population',
      display_name: 'Total Population',
      description: 'Total population count from Census ACS 5-year estimates',
      category_id: category.id,
      unit: 'count',
      is_percentage: false,
      higher_is_better: null,
      available_at_city: true,
      available_at_tract: true,
    })
    .select('id')
    .single();
  
  if (metricError || !newMetric) {
    throw new Error(`Failed to create metric: ${metricError?.message}`);
  }
  
  console.log('Created total_population metric');
  return newMetric.id;
}

async function upsertPopulationData(
  tracts: TractPopulation[],
  metricId: string,
  dryRun: boolean
): Promise<{ inserted: number; errors: number }> {
  if (dryRun) {
    console.log(`  [DRY RUN] Would upsert ${tracts.length} tract records`);
    return { inserted: tracts.length, errors: 0 };
  }
  
  const batchSize = 500;
  let totalInserted = 0;
  let totalErrors = 0;
  
  for (let i = 0; i < tracts.length; i += batchSize) {
    const batch = tracts.slice(i, i + batchSize);
    
    const rows = batch.map(t => ({
      metric_id: metricId,
      geo_fips: t.geoFips,
      geo_level: 'tract',
      geo_name: t.tractName,
      state_fips: t.stateFips,
      state_abbr: t.stateAbbr,
      estimate: t.population,
      data_period: 'Total',
      period_type: 'snapshot',
      source_name: 'Census ACS 5-Year (2018-2022)',
      group_name: 'Total',
    }));
    
    const { error } = await supabase
      .from('health_metric_data')
      .upsert(rows, {
        onConflict: 'metric_id,geo_fips,data_period,group_name',
        ignoreDuplicates: false,
      });
    
    if (error) {
      console.error(`  Batch error: ${error.message}`);
      totalErrors += batch.length;
    } else {
      totalInserted += batch.length;
    }
  }
  
  return { inserted: totalInserted, errors: totalErrors };
}

// States with crime data from crime-sources.ts config
const STATES_WITH_CRIME_DATA = [
  'AK', 'AR', 'AZ', 'CA', 'CO', 'DC', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'KY', 'LA', 'MD', 'MI', 'MN', 'MO', 'NC', 'NE',
  'NM', 'NV', 'NY', 'OH', 'OK', 'PA', 'RI', 'SC', 'TN', 'TX',
  'VA', 'WA', 'WI',
];

function getStatesWithCrimeData(): string[] {
  console.log(`Using ${STATES_WITH_CRIME_DATA.length} states from crime sources config`);
  return STATES_WITH_CRIME_DATA;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const stateFilter = args.find(a => a.startsWith('--state='))?.split('=')[1] || 
                      args[args.indexOf('--state') + 1];
  
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Census ACS Population Ingestion                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Source: Census ACS 5-Year Estimates (2018-2022)`);
  console.log(`Census API Key: ${censusApiKey ? 'Configured' : 'Not set (may hit rate limits)'}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (stateFilter) {
    console.log(`State filter: ${stateFilter}`);
  }
  console.log('');
  
  // Get or create the population metric
  console.log('STEP 1: Ensuring total_population metric exists...');
  const metricId = await getOrCreatePopulationMetric();
  console.log(`  Metric ID: ${metricId}`);
  
  // Determine which states to process
  let statesToProcess: string[];
  if (stateFilter) {
    statesToProcess = [stateFilter.toUpperCase()];
  } else {
    statesToProcess = await getStatesWithCrimeData();
  }
  
  if (statesToProcess.length === 0) {
    console.log('No states to process.');
    return;
  }
  
  // Process each state
  console.log(`\nSTEP 2: Fetching population data for ${statesToProcess.length} states...\n`);
  
  let totalTracts = 0;
  let totalInserted = 0;
  let totalErrors = 0;
  
  for (const stateAbbr of statesToProcess) {
    const stateFips = STATE_FIPS[stateAbbr];
    if (!stateFips) {
      console.log(`  ${stateAbbr}: Unknown state, skipping`);
      continue;
    }
    
    process.stdout.write(`  ${stateAbbr} (FIPS ${stateFips})... `);
    
    const tracts = await fetchStatePopulation(stateFips);
    
    if (tracts.length === 0) {
      console.log('no data');
      continue;
    }
    
    const { inserted, errors } = await upsertPopulationData(tracts, metricId, dryRun);
    
    totalTracts += tracts.length;
    totalInserted += inserted;
    totalErrors += errors;
    
    console.log(`${tracts.length} tracts, ${inserted} inserted${errors > 0 ? `, ${errors} errors` : ''}`);
    
    // Rate limiting - be nice to Census API
    if (!censusApiKey) {
      await sleep(500);
    } else {
      await sleep(100);
    }
  }
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('Summary');
  console.log('═'.repeat(60));
  console.log(`States processed: ${statesToProcess.length}`);
  console.log(`Total tracts: ${totalTracts.toLocaleString()}`);
  console.log(`Records inserted: ${totalInserted.toLocaleString()}`);
  if (totalErrors > 0) {
    console.log(`Errors: ${totalErrors.toLocaleString()}`);
  }
  console.log('═'.repeat(60));
}

main()
  .then(() => {
    console.log('\nPopulation ingestion complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
