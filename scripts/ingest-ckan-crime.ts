#!/usr/bin/env npx tsx
/**
 * CKAN Crime Data Ingestion Script
 * 
 * Ingests crime data from cities using CKAN data platforms:
 * - Boston, MA (data.boston.gov)
 * - Milwaukee, WI (data.milwaukee.gov)
 * - Pittsburgh, PA (data.wprdc.org)
 * 
 * Usage:
 *   npx tsx scripts/ingest-ckan-crime.ts --city "Boston"
 *   npx tsx scripts/ingest-ckan-crime.ts --city "Boston" --dry-run
 *   npx tsx scripts/ingest-ckan-crime.ts --list
 *   npx tsx scripts/ingest-ckan-crime.ts --city "all"
 * 
 * Features:
 * - Fetches crime incidents via CKAN DataStore API
 * - Normalizes offense types to 10 standard crime categories
 * - Stores in crime_incidents table for later tract aggregation
 */

import { createClient } from '@supabase/supabase-js';
import { 
  CKAN_ENDPOINTS, 
  CKANEndpoint, 
  normalizeOffenseType,
  CrimeMetricKey
} from './config/crime-sources';

const BATCH_SIZE = 1000;
const PAGE_SIZE = 10000;
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

function buildCKANUrl(endpoint: CKANEndpoint, offset: number, limit: number): string {
  const baseUrl = `https://${endpoint.domain}/api/3/action/datastore_search`;
  const params = new URLSearchParams({
    'resource_id': endpoint.resourceId,
    'limit': limit.toString(),
    'offset': offset.toString(),
  });
  
  return `${baseUrl}?${params.toString()}`;
}

const MILWAUKEE_OFFENSE_MAPPING: Record<string, CrimeMetricKey> = {
  'AssaultOffense': 'assault_rate',
  'Arson': 'vandalism_rate',
  'Burglary': 'burglary_rate',
  'CriminalDamage': 'vandalism_rate',
  'Homicide': 'assault_rate',
  'Robbery': 'robbery_rate',
  'SexOffense': 'sex_offense_rate',
  'Theft': 'theft_rate',
  'VehicleTheft': 'vehicle_theft_rate',
  'LockedVehicle': 'theft_rate',
};

function parseMilwaukeeIncident(record: any, endpoint: CKANEndpoint): CrimeIncident[] {
  const mappings = endpoint.fieldMappings;
  const incidents: CrimeIncident[] = [];
  
  let incidentDate: Date | null = null;
  const dateValue = record[mappings.date];
  if (dateValue) {
    incidentDate = new Date(dateValue);
    if (isNaN(incidentDate.getTime())) incidentDate = null;
  }
  
  let lat: number | null = null;
  let lon: number | null = null;
  
  if (mappings.latitude && mappings.longitude) {
    lat = parseFloat(record[mappings.latitude]) || null;
    lon = parseFloat(record[mappings.longitude]) || null;
  }
  
  if (lat === 0) lat = null;
  if (lon === 0) lon = null;
  
  for (const [field, normalizedType] of Object.entries(MILWAUKEE_OFFENSE_MAPPING)) {
    if (record[field] === '1' || record[field] === 1) {
      incidents.push({
        city: endpoint.name,
        state: endpoint.state,
        incident_date: incidentDate,
        offense_type: field,
        normalized_type: normalizedType,
        latitude: lat,
        longitude: lon,
        address: record[mappings.address] || null,
        case_number: record[mappings.caseNumber] || null,
        source: `ckan_${endpoint.name.toLowerCase().replace(/\s+/g, '_')}`,
        raw_data: record,
      });
    }
  }
  
  return incidents;
}

function parseIncident(record: any, endpoint: CKANEndpoint): CrimeIncident | null {
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
    lat = parseFloat(record[mappings.latitude]) || null;
    lon = parseFloat(record[mappings.longitude]) || null;
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
    source: `ckan_${endpoint.name.toLowerCase().replace(/\s+/g, '_')}`,
    raw_data: record,
  };
}

async function fetchCKANData(
  endpoint: CKANEndpoint, 
  onProgress?: (fetched: number) => void
): Promise<CrimeIncident[]> {
  const allIncidents: CrimeIncident[] = [];
  let offset = 0;
  let hasMore = true;
  
  console.log(`Fetching from ${endpoint.name}, ${endpoint.state}...`);
  console.log(`  Domain: ${endpoint.domain}`);
  console.log(`  Resource ID: ${endpoint.resourceId}`);
  
  while (hasMore) {
    const url = buildCKANUrl(endpoint, offset, PAGE_SIZE);
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`  HTTP Error: ${response.status} ${response.statusText}`);
        const text = await response.text();
        console.error(`  Response: ${text.substring(0, 200)}`);
        break;
      }
      
      const data = await response.json();
      
      if (!data.success) {
        console.error(`  API Error:`, data.error);
        break;
      }
      
      const records = data.result?.records || [];
      
      if (!Array.isArray(records) || records.length === 0) {
        hasMore = false;
        continue;
      }
      
      for (const record of records) {
        if (endpoint.name === 'Milwaukee') {
          const milwaukeeIncidents = parseMilwaukeeIncident(record, endpoint);
          allIncidents.push(...milwaukeeIncidents);
        } else {
          const incident = parseIncident(record, endpoint);
          if (incident) {
            allIncidents.push(incident);
          }
        }
      }
      
      const fetched = offset + records.length;
      console.log(`  Fetched ${fetched} records (${allIncidents.length} parsed)...`);
      onProgress?.(fetched);
      
      const total = data.result?.total;
      if (total && fetched >= total) {
        hasMore = false;
      } else if (records.length < PAGE_SIZE) {
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
    const sample = incidents.slice(0, 5);
    console.log('Sample incidents:');
    for (const inc of sample) {
      console.log(`  ${inc.incident_date?.toISOString()?.slice(0, 10) || 'no-date'} | ${inc.offense_type} → ${inc.normalized_type || 'unmapped'}`);
    }
    return { inserted: incidents.length, errors: 0 };
  }
  
  let inserted = 0;
  let errors = 0;
  
  for (let i = 0; i < incidents.length; i += BATCH_SIZE) {
    const batch = incidents.slice(i, i + BATCH_SIZE);
    
    const rows = batch.map(inc => ({
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
    
    const { error } = await supabase
      .from('crime_incidents')
      .insert(rows);
    
    if (error) {
      console.error(`  Batch error at ${i}:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
    
    if ((i + BATCH_SIZE) % 5000 === 0) {
      console.log(`  Inserted ${inserted} records...`);
    }
  }
  
  return { inserted, errors };
}

function listCKANCities(): void {
  console.log('=== Available CKAN Crime Data Sources ===\n');
  
  for (const ep of CKAN_ENDPOINTS) {
    console.log(`${ep.name}, ${ep.state}`);
    console.log(`  Domain: ${ep.domain}`);
    console.log(`  Resource ID: ${ep.resourceId}`);
    console.log(`  Period: ${ep.datePeriod}`);
    console.log('');
  }
  
  console.log(`Total: ${CKAN_ENDPOINTS.length} cities`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--list')) {
    listCKANCities();
    return;
  }
  
  const cityIndex = args.indexOf('--city');
  if (cityIndex === -1 || !args[cityIndex + 1]) {
    console.log('Usage:');
    console.log('  npx tsx scripts/ingest-ckan-crime.ts --city "Boston"');
    console.log('  npx tsx scripts/ingest-ckan-crime.ts --city "all"');
    console.log('  npx tsx scripts/ingest-ckan-crime.ts --list');
    console.log('');
    console.log('Options:');
    console.log('  --dry-run    Preview without inserting');
    return;
  }
  
  const cityName = args[cityIndex + 1];
  const dryRun = args.includes('--dry-run');
  
  let endpoints: CKANEndpoint[];
  
  if (cityName.toLowerCase() === 'all') {
    endpoints = CKAN_ENDPOINTS;
  } else {
    const endpoint = CKAN_ENDPOINTS.find(
      ep => ep.name.toLowerCase() === cityName.toLowerCase()
    );
    if (!endpoint) {
      console.error(`City not found: ${cityName}`);
      console.log('Available CKAN cities:');
      for (const ep of CKAN_ENDPOINTS) {
        console.log(`  - ${ep.name}, ${ep.state}`);
      }
      return;
    }
    endpoints = [endpoint];
  }
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return;
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log(`\n=== CKAN Crime Data Ingestion ===`);
  console.log(`Cities: ${endpoints.map(e => e.name).join(', ')}`);
  console.log(`Dry run: ${dryRun}`);
  console.log('');
  
  for (const endpoint of endpoints) {
    console.log(`\n--- ${endpoint.name}, ${endpoint.state} ---`);
    
    try {
      const incidents = await fetchCKANData(endpoint);
      
      if (incidents.length === 0) {
        console.log('  No incidents found');
        continue;
      }
      
      const typeCounts = new Map<string, number>();
      for (const inc of incidents) {
        const key = inc.normalized_type || 'unmapped';
        typeCounts.set(key, (typeCounts.get(key) || 0) + 1);
      }
      
      console.log('  Type distribution:');
      for (const [type, count] of [...typeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
        console.log(`    ${type}: ${count}`);
      }
      
      const result = await upsertIncidents(supabase, incidents, dryRun);
      console.log(`  Result: ${result.inserted} inserted, ${result.errors} errors`);
      
    } catch (error) {
      console.error(`  Error processing ${endpoint.name}:`, error);
    }
  }
  
  console.log('\n=== Complete ===');
}

main().catch(console.error);
