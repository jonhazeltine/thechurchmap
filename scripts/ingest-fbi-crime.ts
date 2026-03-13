#!/usr/bin/env npx tsx
/**
 * Ingest crime data from FBI Crime Data API
 * 
 * Usage:
 *   npx tsx scripts/ingest-fbi-crime.ts --state MI
 *   npx tsx scripts/ingest-fbi-crime.ts --state MI --dry-run
 * 
 * Requires: FBI_CRIME_API_KEY environment variable (from data.gov)
 * 
 * Source: https://api.usa.gov/crime/fbi/sapi/
 * Docs: https://crime-data-api.fr.cloud.gov/swagger-ui/
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const FBI_API_BASE = 'https://api.usa.gov/crime/fbi/sapi';

// State codes to FBI state abbreviations
const STATE_ABBREVS: Record<string, string> = {
  AL: 'AL', AK: 'AK', AZ: 'AZ', AR: 'AR', CA: 'CA', CO: 'CO', CT: 'CT', DE: 'DE',
  FL: 'FL', GA: 'GA', HI: 'HI', ID: 'ID', IL: 'IL', IN: 'IN', IA: 'IA', KS: 'KS',
  KY: 'KY', LA: 'LA', ME: 'ME', MD: 'MD', MA: 'MA', MI: 'MI', MN: 'MN', MS: 'MS',
  MO: 'MO', MT: 'MT', NE: 'NE', NV: 'NV', NH: 'NH', NJ: 'NJ', NM: 'NM', NY: 'NY',
  NC: 'NC', ND: 'ND', OH: 'OH', OK: 'OK', OR: 'OR', PA: 'PA', RI: 'RI', SC: 'SC',
  SD: 'SD', TN: 'TN', TX: 'TX', UT: 'UT', VT: 'VT', VA: 'VA', WA: 'WA', WV: 'WV',
  WI: 'WI', WY: 'WY', DC: 'DC'
};

interface AgencyCrime {
  ori: string;
  agency_name: string;
  state_abbr: string;
  county_name: string | null;
  population: number | null;
  year: number;
  offense_type: string;
  actual: number;
  cleared: number;
}

interface CrimeMetric {
  agency_ori: string;
  agency_name: string;
  state: string;
  county: string | null;
  year: number;
  population: number | null;
  violent_crime: number;
  property_crime: number;
  homicide: number;
  robbery: number;
  aggravated_assault: number;
  burglary: number;
  larceny: number;
  motor_vehicle_theft: number;
  source: string;
}

async function fetchAgencies(stateAbbrev: string, apiKey: string): Promise<any[]> {
  const url = `${FBI_API_BASE}/api/agencies?state_abbr=${stateAbbrev}&api_key=${apiKey}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`FBI API error: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  return data || [];
}

async function fetchAgencyCrimeData(ori: string, apiKey: string): Promise<any[]> {
  // Get summarized crime data for the agency
  const url = `${FBI_API_BASE}/api/summarized/agencies/${ori}/offenses?api_key=${apiKey}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    return data.results || [];
  } catch {
    return [];
  }
}

async function fetchStateEstimates(stateAbbrev: string, apiKey: string): Promise<any[]> {
  // Get state-level crime estimates
  const url = `${FBI_API_BASE}/api/estimates/states/${stateAbbrev}?api_key=${apiKey}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    return data.results || [];
  } catch {
    return [];
  }
}

function aggregateAgencyCrime(agencyData: any[], agency: any): CrimeMetric | null {
  if (!agencyData.length) return null;
  
  // Get the most recent year's data
  const byYear = new Map<number, Record<string, number>>();
  
  for (const record of agencyData) {
    const year = record.data_year || record.year;
    if (!year) continue;
    
    if (!byYear.has(year)) {
      byYear.set(year, {
        violent_crime: 0,
        property_crime: 0,
        homicide: 0,
        robbery: 0,
        aggravated_assault: 0,
        burglary: 0,
        larceny: 0,
        motor_vehicle_theft: 0
      });
    }
    
    const yearData = byYear.get(year)!;
    const offense = record.offense?.toLowerCase() || '';
    const count = record.actual || record.offense_count || 0;
    
    if (offense.includes('homicide') || offense.includes('murder')) {
      yearData.homicide += count;
      yearData.violent_crime += count;
    } else if (offense.includes('robbery')) {
      yearData.robbery += count;
      yearData.violent_crime += count;
    } else if (offense.includes('assault')) {
      yearData.aggravated_assault += count;
      yearData.violent_crime += count;
    } else if (offense.includes('burglary')) {
      yearData.burglary += count;
      yearData.property_crime += count;
    } else if (offense.includes('larceny') || offense.includes('theft')) {
      if (offense.includes('motor') || offense.includes('vehicle')) {
        yearData.motor_vehicle_theft += count;
      } else {
        yearData.larceny += count;
      }
      yearData.property_crime += count;
    }
  }
  
  if (byYear.size === 0) return null;
  
  // Get most recent year
  const years = Array.from(byYear.keys()).sort((a, b) => b - a);
  const latestYear = years[0];
  const data = byYear.get(latestYear)!;
  
  return {
    agency_ori: agency.ori,
    agency_name: agency.agency_name || agency.agency_type_name || 'Unknown',
    state: agency.state_abbr,
    county: agency.county_name || null,
    year: latestYear,
    population: agency.population || null,
    violent_crime: data.violent_crime,
    property_crime: data.property_crime,
    homicide: data.homicide,
    robbery: data.robbery,
    aggravated_assault: data.aggravated_assault,
    burglary: data.burglary,
    larceny: data.larceny,
    motor_vehicle_theft: data.motor_vehicle_theft,
    source: 'fbi_ucr'
  };
}

async function upsertCrimeMetrics(metrics: CrimeMetric[], dryRun: boolean): Promise<number> {
  if (dryRun) {
    console.log(`  [DRY RUN] Would upsert ${metrics.length} crime metrics`);
    return metrics.length;
  }
  
  let upserted = 0;
  const BATCH_SIZE = 50;
  
  for (let i = 0; i < metrics.length; i += BATCH_SIZE) {
    const batch = metrics.slice(i, i + BATCH_SIZE);
    
    const { error } = await supabase
      .from('crime_metrics')
      .upsert(batch, {
        onConflict: 'agency_ori,year',
        ignoreDuplicates: false
      });
    
    if (error) {
      console.error(`  Error upserting batch: ${error.message}`);
    } else {
      upserted += batch.length;
    }
  }
  
  return upserted;
}

async function recordIngestionRun(
  state: string,
  status: 'running' | 'completed' | 'failed',
  counts: { fetched: number; inserted: number },
  error?: string
) {
  try {
    if (status === 'running') {
      await supabase
        .from('ingestion_runs')
        .insert({
          dataset: 'crime_fbi',
          state,
          status: 'running',
          features_fetched: 0,
          features_inserted: 0
        });
    } else {
      await supabase
        .from('ingestion_runs')
        .update({
          status,
          completed_at: new Date().toISOString(),
          features_fetched: counts.fetched,
          features_inserted: counts.inserted,
          error_message: error || null
        })
        .eq('dataset', 'crime_fbi')
        .eq('state', state)
        .eq('status', 'running');
    }
  } catch (e) {
    console.log('  Warning: Could not record ingestion run');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const stateIndex = args.indexOf('--state');
  const dryRun = args.includes('--dry-run');
  
  const apiKey = process.env.FBI_CRIME_API_KEY;
  
  if (!apiKey) {
    console.error('Error: FBI_CRIME_API_KEY environment variable required');
    console.log('\nGet an API key from: https://api.data.gov/signup/');
    process.exit(1);
  }
  
  if (stateIndex === -1 || !args[stateIndex + 1]) {
    console.log('Usage: npx tsx scripts/ingest-fbi-crime.ts --state MI [--dry-run]');
    console.log('\nAvailable states:', Object.keys(STATE_ABBREVS).join(', '));
    process.exit(1);
  }
  
  const stateCode = args[stateIndex + 1].toUpperCase();
  
  if (!STATE_ABBREVS[stateCode]) {
    console.error(`Unknown state: ${stateCode}`);
    process.exit(1);
  }
  
  console.log(`=== Ingest FBI Crime Data ===`);
  console.log(`State: ${stateCode}`);
  if (dryRun) console.log(`Mode: DRY RUN`);
  console.log('');
  
  if (!dryRun) {
    await recordIngestionRun(stateCode, 'running', { fetched: 0, inserted: 0 });
  }
  
  try {
    // Fetch agencies in state
    console.log('Fetching agencies...');
    const agencies = await fetchAgencies(stateCode, apiKey);
    console.log(`Found ${agencies.length} agencies`);
    
    // Fetch crime data for each agency
    console.log('\nFetching crime data per agency...');
    const metrics: CrimeMetric[] = [];
    let processed = 0;
    
    for (const agency of agencies) {
      if (!agency.ori) continue;
      
      // Rate limit: 100ms between requests
      await new Promise(r => setTimeout(r, 100));
      
      const crimeData = await fetchAgencyCrimeData(agency.ori, apiKey);
      const metric = aggregateAgencyCrime(crimeData, agency);
      
      if (metric) {
        metrics.push(metric);
      }
      
      processed++;
      if (processed % 50 === 0 || processed === agencies.length) {
        console.log(`  Processed ${processed}/${agencies.length} agencies (${metrics.length} with data)`);
      }
    }
    
    console.log(`\nCollected ${metrics.length} agency crime records`);
    
    // Upsert to Supabase
    console.log('\nUpserting to Supabase...');
    const upserted = await upsertCrimeMetrics(metrics, dryRun);
    
    console.log(`\n✅ Complete!`);
    console.log(`   State: ${stateCode}`);
    console.log(`   Agencies processed: ${processed}`);
    console.log(`   Crime metrics imported: ${upserted}`);
    
    if (!dryRun) {
      await recordIngestionRun(stateCode, 'completed', {
        fetched: processed,
        inserted: upserted
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
    if (!dryRun) {
      await recordIngestionRun(stateCode, 'failed', { fetched: 0, inserted: 0 }, String(error));
    }
    process.exit(1);
  }
}

main();
