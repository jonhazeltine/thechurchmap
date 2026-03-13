#!/usr/bin/env npx tsx
/**
 * Unified Socrata Crime Data Ingestion Script
 * 
 * Ingests crime data from cities using Socrata/Tyler Data platforms:
 * - Dallas, Houston, Austin, San Antonio, Fort Worth (TX)
 * - Detroit (MI)
 * 
 * Usage:
 *   npx tsx scripts/ingest-socrata-crime.ts --city "Fort Worth"
 *   npx tsx scripts/ingest-socrata-crime.ts --city "Fort Worth" --dry-run
 *   npx tsx scripts/ingest-socrata-crime.ts --list
 *   npx tsx scripts/ingest-socrata-crime.ts --city "all" --state TX
 * 
 * Features:
 * - Fetches crime incidents via Socrata SODA API
 * - Normalizes offense types to 10 standard crime categories
 * - Stores in crime_incidents table for later tract aggregation
 */

import { createClient } from '@supabase/supabase-js';
import { 
  SOCRATA_ENDPOINTS, 
  SocrataEndpoint, 
  normalizeOffenseType,
  CrimeMetricKey,
  listAvailableCities 
} from './config/crime-sources';

const BATCH_SIZE = 1000;
const PAGE_SIZE = 50000;
const RATE_LIMIT_MS = 200;

interface CrimeIncident {
  city: string;
  state: string;
  incident_date: Date | null;
  offense_type: string;
  normalized_type: CrimeMetricKey | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  case_number: string | null;
  source: string;
  raw_data: Record<string, any>;
}

function buildSocrataUrl(endpoint: SocrataEndpoint, offset: number, limit: number, year?: number): string {
  const baseUrl = `https://${endpoint.domain}/resource/${endpoint.datasetId}.json`;
  const params = new URLSearchParams({
    '$limit': limit.toString(),
    '$offset': offset.toString(),
    '$order': `${endpoint.fieldMappings.date} DESC`,
  });
  
  if (year) {
    params.append('$where', `${endpoint.fieldMappings.date} >= '${year}-01-01T00:00:00' AND ${endpoint.fieldMappings.date} < '${year + 1}-01-01T00:00:00'`);
  }
  
  return `${baseUrl}?${params.toString()}`;
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function parseIncident(record: any, endpoint: SocrataEndpoint): CrimeIncident | null {
  const mappings = endpoint.fieldMappings;
  
  const offenseType = record[mappings.offenseType];
  if (!offenseType) return null;
  
  let incidentDate: Date | null = null;
  const dateValue = record[mappings.date];
  if (dateValue) {
    incidentDate = new Date(dateValue);
    if (isNaN(incidentDate.getTime())) incidentDate = null;
  }
  
  let lat: number | null = null;
  let lon: number | null = null;
  
  if (mappings.latitude && mappings.longitude) {
    lat = parseFloat(getNestedValue(record, mappings.latitude)) || null;
    lon = parseFloat(getNestedValue(record, mappings.longitude)) || null;
  }
  
  if (lat === 0) lat = null;
  if (lon === 0) lon = null;
  
  const normalizedType = normalizeOffenseType(offenseType);
  
  return {
    city: endpoint.name,
    state: endpoint.state,
    incident_date: incidentDate,
    offense_type: offenseType,
    normalized_type: normalizedType,
    latitude: lat,
    longitude: lon,
    address: mappings.address ? record[mappings.address] || null : null,
    case_number: mappings.caseNumber ? record[mappings.caseNumber] || null : null,
    source: `socrata_${endpoint.name.toLowerCase().replace(/\s+/g, '_')}`,
    raw_data: record,
  };
}

async function fetchSocrataData(
  endpoint: SocrataEndpoint, 
  year?: number,
  onProgress?: (fetched: number) => void
): Promise<CrimeIncident[]> {
  const allIncidents: CrimeIncident[] = [];
  let offset = 0;
  let hasMore = true;
  
  console.log(`Fetching from ${endpoint.name}, ${endpoint.state}...`);
  console.log(`  Domain: ${endpoint.domain}`);
  console.log(`  Dataset: ${endpoint.datasetId}`);
  if (year) console.log(`  Year: ${year}`);
  
  while (hasMore) {
    const url = buildSocrataUrl(endpoint, offset, PAGE_SIZE, year);
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`  HTTP Error: ${response.status} ${response.statusText}`);
        const text = await response.text();
        console.error(`  Response: ${text.substring(0, 200)}`);
        break;
      }
      
      const records = await response.json();
      
      if (!Array.isArray(records) || records.length === 0) {
        hasMore = false;
        continue;
      }
      
      for (const record of records) {
        const incident = parseIncident(record, endpoint);
        if (incident) {
          allIncidents.push(incident);
        }
      }
      
      const fetched = offset + records.length;
      console.log(`  Fetched ${fetched} records (${allIncidents.length} parsed)...`);
      onProgress?.(fetched);
      
      if (records.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += records.length;
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
      }
    } catch (error) {
      console.error(`  Error at offset ${offset}:`, error);
      break;
    }
  }
  
  console.log(`  Total incidents: ${allIncidents.length}`);
  return allIncidents;
}

async function upsertIncidents(
  supabase: any,
  incidents: CrimeIncident[],
  dryRun: boolean
): Promise<{ inserted: number; errors: number }> {
  if (dryRun) {
    console.log(`[DRY RUN] Would insert ${incidents.length} incidents`);
    return { inserted: incidents.length, errors: 0 };
  }
  
  let inserted = 0;
  let errors = 0;
  
  for (let i = 0; i < incidents.length; i += BATCH_SIZE) {
    const batch = incidents.slice(i, i + BATCH_SIZE);
    
    const records = batch.map(inc => ({
      city: inc.city,
      state: inc.state,
      incident_date: inc.incident_date?.toISOString() || null,
      offense_type: inc.offense_type,
      normalized_type: inc.normalized_type,
      address: inc.address,
      location: inc.latitude && inc.longitude
        ? `SRID=4326;POINT(${inc.longitude} ${inc.latitude})`
        : null,
      case_number: inc.case_number,
      source: inc.source,
      raw_data: inc.raw_data,
    }));
    
    // Split records: those with case_number can use upsert, others use insert
    const recordsWithCaseNumber = records.filter(r => r.case_number);
    const recordsWithoutCaseNumber = records.filter(r => !r.case_number);

    // Use upsert for records with case_number (database-level deduplication)
    if (recordsWithCaseNumber.length > 0) {
      const { error: upsertError } = await supabase
        .from('crime_incidents')
        .upsert(recordsWithCaseNumber as any, {
          onConflict: 'source,case_number',
          ignoreDuplicates: true,
        });

      if (upsertError) {
        console.error(`  Error upserting batch at ${i}: ${upsertError.message}`);
        errors += recordsWithCaseNumber.length;
      } else {
        inserted += recordsWithCaseNumber.length;
      }
    }

    // Use insert for records without case_number (can't dedupe without identifier)
    if (recordsWithoutCaseNumber.length > 0) {
      const { error: insertError } = await supabase
        .from('crime_incidents')
        .insert(recordsWithoutCaseNumber as any);

      if (insertError) {
        console.error(`  Error inserting batch at ${i}: ${insertError.message}`);
        errors += recordsWithoutCaseNumber.length;
      } else {
        inserted += recordsWithoutCaseNumber.length;
      }
    }
    
    if ((i + BATCH_SIZE) % 5000 === 0 || i + BATCH_SIZE >= incidents.length) {
      console.log(`  Inserted ${Math.min(i + BATCH_SIZE, incidents.length)}/${incidents.length}`);
    }
  }
  
  return { inserted, errors };
}

async function clearCityData(
  supabase: any,
  cityName: string,
  stateName: string,
  dryRun: boolean
): Promise<number> {
  if (dryRun) {
    const { count } = await supabase
      .from('crime_incidents')
      .select('*', { count: 'exact', head: true })
      .eq('city', cityName)
      .eq('state', stateName);
    
    console.log(`[DRY RUN] Would delete ${count || 0} existing records for ${cityName}, ${stateName}`);
    return count || 0;
  }
  
  const { error, count } = await supabase
    .from('crime_incidents')
    .delete({ count: 'exact' })
    .eq('city', cityName)
    .eq('state', stateName);
  
  if (error) {
    console.error(`  Error clearing old data: ${error.message}`);
    return 0;
  }
  
  console.log(`  Cleared ${count || 0} existing records for ${cityName}`);
  return count || 0;
}

async function recordIngestionRun(
  supabase: any,
  city: string,
  state: string,
  status: 'running' | 'completed' | 'failed',
  counts: { fetched: number; inserted: number },
  error?: string
): Promise<void> {
  try {
    const dataset = `crime_socrata_${city.toLowerCase().replace(/\s+/g, '_')}`;
    
    if (status === 'running') {
      await supabase
        .from('ingestion_runs')
        .insert({
          dataset,
          state,
          status: 'running',
          features_fetched: 0,
          features_inserted: 0,
        });
    } else {
      await supabase
        .from('ingestion_runs')
        .update({
          status,
          completed_at: new Date().toISOString(),
          features_fetched: counts.fetched,
          features_inserted: counts.inserted,
          error_message: error || null,
        })
        .eq('dataset', dataset)
        .eq('state', state)
        .eq('status', 'running');
    }
  } catch {
    console.log('  Warning: Could not record ingestion run');
  }
}

async function ingestCity(
  supabase: any,
  endpoint: SocrataEndpoint,
  options: { dryRun: boolean; year?: number; clearFirst?: boolean }
): Promise<{ fetched: number; inserted: number }> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Ingesting: ${endpoint.name}, ${endpoint.state}`);
  console.log(`${'='.repeat(60)}`);
  
  if (!options.dryRun) {
    await recordIngestionRun(supabase, endpoint.name, endpoint.state, 'running', { fetched: 0, inserted: 0 });
  }
  
  try {
    if (options.clearFirst) {
      await clearCityData(supabase, endpoint.name, endpoint.state, options.dryRun);
    }
    
    const incidents = await fetchSocrataData(endpoint, options.year);
    
    if (incidents.length === 0) {
      console.log('No incidents found.');
      if (!options.dryRun) {
        await recordIngestionRun(supabase, endpoint.name, endpoint.state, 'completed', { fetched: 0, inserted: 0 });
      }
      return { fetched: 0, inserted: 0 };
    }
    
    const typeCounts: Record<string, number> = {};
    const normalizedCounts: Record<string, number> = {};
    
    for (const inc of incidents) {
      typeCounts[inc.offense_type] = (typeCounts[inc.offense_type] || 0) + 1;
      if (inc.normalized_type) {
        normalizedCounts[inc.normalized_type] = (normalizedCounts[inc.normalized_type] || 0) + 1;
      }
    }
    
    console.log('\nTop offense types:');
    Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([type, count]) => console.log(`  ${type}: ${count}`));
    
    console.log('\nNormalized type distribution:');
    Object.entries(normalizedCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => console.log(`  ${type}: ${count}`));
    
    const unmapped = incidents.filter(i => !i.normalized_type).length;
    console.log(`\nUnmapped offense types: ${unmapped} (${((unmapped / incidents.length) * 100).toFixed(1)}%)`);
    
    console.log('\nInserting to database...');
    const { inserted, errors } = await upsertIncidents(supabase, incidents, options.dryRun);
    
    if (!options.dryRun) {
      await recordIngestionRun(
        supabase, 
        endpoint.name, 
        endpoint.state, 
        errors > 0 ? 'failed' : 'completed',
        { fetched: incidents.length, inserted }
      );
    }
    
    console.log(`\nComplete! Fetched: ${incidents.length}, Inserted: ${inserted}, Errors: ${errors}`);
    
    return { fetched: incidents.length, inserted };
    
  } catch (error) {
    console.error(`Error ingesting ${endpoint.name}:`, error);
    if (!options.dryRun) {
      await recordIngestionRun(
        supabase, 
        endpoint.name, 
        endpoint.state, 
        'failed',
        { fetched: 0, inserted: 0 },
        String(error)
      );
    }
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--list')) {
    listAvailableCities();
    return;
  }
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const cityIndex = args.indexOf('--city');
  const stateIndex = args.indexOf('--state');
  const yearIndex = args.indexOf('--year');
  const dryRun = args.includes('--dry-run');
  const clearFirst = args.includes('--clear');
  
  if (cityIndex === -1 || !args[cityIndex + 1]) {
    console.log('Usage:');
    console.log('  npx tsx scripts/ingest-socrata-crime.ts --list');
    console.log('  npx tsx scripts/ingest-socrata-crime.ts --city "Fort Worth" [--year 2024] [--dry-run] [--clear]');
    console.log('  npx tsx scripts/ingest-socrata-crime.ts --city all --state TX [--year 2024]');
    console.log('\nOptions:');
    console.log('  --city    City name or "all" for all cities in a state');
    console.log('  --state   Required with --city all to specify state (MI or TX)');
    console.log('  --year    Filter to specific year (e.g., 2024)');
    console.log('  --dry-run Test without writing to database');
    console.log('  --clear   Clear existing data for city before inserting');
    process.exit(1);
  }
  
  const cityArg = args[cityIndex + 1];
  const stateArg = stateIndex !== -1 ? args[stateIndex + 1] : null;
  const year = yearIndex !== -1 ? parseInt(args[yearIndex + 1]) : undefined;
  
  let endpoints: SocrataEndpoint[] = [];
  
  if (cityArg.toLowerCase() === 'all') {
    if (!stateArg) {
      console.error('Error: --state required when using --city all');
      process.exit(1);
    }
    endpoints = SOCRATA_ENDPOINTS.filter(ep => ep.state.toUpperCase() === stateArg.toUpperCase());
    if (endpoints.length === 0) {
      console.error(`No Socrata endpoints found for state: ${stateArg}`);
      console.log('Available states:', [...new Set(SOCRATA_ENDPOINTS.map(e => e.state))].join(', '));
      process.exit(1);
    }
  } else {
    const endpoint = SOCRATA_ENDPOINTS.find(
      ep => ep.name.toLowerCase() === cityArg.toLowerCase()
    );
    if (!endpoint) {
      console.error(`City not found: ${cityArg}`);
      console.log('\nAvailable Socrata cities:');
      SOCRATA_ENDPOINTS.forEach(ep => console.log(`  - ${ep.name}, ${ep.state}`));
      process.exit(1);
    }
    endpoints = [endpoint];
  }
  
  console.log('='.repeat(60));
  console.log('Socrata Crime Data Ingestion');
  console.log('='.repeat(60));
  console.log(`Cities: ${endpoints.map(e => e.name).join(', ')}`);
  if (year) console.log(`Year: ${year}`);
  if (dryRun) console.log('Mode: DRY RUN');
  if (clearFirst) console.log('Clear existing: YES');
  
  let totalFetched = 0;
  let totalInserted = 0;
  
  for (const endpoint of endpoints) {
    try {
      const { fetched, inserted } = await ingestCity(supabase, endpoint, { 
        dryRun, 
        year,
        clearFirst 
      });
      totalFetched += fetched;
      totalInserted += inserted;
    } catch (error) {
      console.error(`Failed to ingest ${endpoint.name}:`, error);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Cities processed: ${endpoints.length}`);
  console.log(`Total fetched: ${totalFetched}`);
  console.log(`Total inserted: ${totalInserted}`);
}

main().catch(console.error);
