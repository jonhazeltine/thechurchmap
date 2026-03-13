#!/usr/bin/env npx tsx
/**
 * Scheduled Crime Data Ingestion Runner
 * 
 * Designed to run as a Scheduled Deployment - runs independently of development environment.
 * Takes a city name and ingests all crime data for that city.
 * 
 * Usage (for Scheduled Deployments):
 *   npx tsx scripts/scheduled-crime-ingestion.ts "Las Vegas"
 *   npx tsx scripts/scheduled-crime-ingestion.ts "San Francisco"
 *   npx tsx scripts/scheduled-crime-ingestion.ts "Philadelphia"
 * 
 * Usage (for listing):
 *   npx tsx scripts/scheduled-crime-ingestion.ts --list
 * 
 * Features:
 * - Handles all source types: arcgis, socrata, carto, ckan
 * - Logs progress for monitoring
 * - Designed for long-running scheduled deployments (up to 1 hour)
 */

import { createClient } from '@supabase/supabase-js';
import { 
  ARCGIS_ENDPOINTS, 
  SOCRATA_ENDPOINTS, 
  CARTO_ENDPOINTS,
  CKAN_ENDPOINTS,
  ALL_ENDPOINTS,
  ArcGISEndpoint,
  SocrataEndpoint,
  CartoEndpoint,
  CKANEndpoint,
  CrimeEndpoint,
  normalizeOffenseType,
  CrimeMetricKey,
} from './config/crime-sources';

const BATCH_SIZE = 1000;
const ARCGIS_PAGE_SIZE = 2000;
const SOCRATA_PAGE_SIZE = 50000;
const CARTO_PAGE_SIZE = 50000;
const RATE_LIMIT_MS = 100;

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

function sanitizeForJson(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    return obj
      .replace(/[\x00-\x1F\x7F]/g, '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForJson);
  }
  if (typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeForJson(value);
    }
    return result;
  }
  return obj;
}

// ============= ArcGIS Ingestion =============

async function getTotalRecordCount(endpoint: ArcGISEndpoint): Promise<number> {
  const url = `${endpoint.serviceUrl}/${endpoint.layerId}/query`;
  const params = new URLSearchParams({
    where: '1=1',
    returnCountOnly: 'true',
    f: 'json',
  });
  
  try {
    const response = await fetch(`${url}?${params}`);
    const data = await response.json();
    return data.count || 0;
  } catch {
    return 0;
  }
}

async function fetchArcGISPage(
  endpoint: ArcGISEndpoint,
  offset: number,
  limit: number
): Promise<{ features: any[]; exceededLimit: boolean }> {
  const url = `${endpoint.serviceUrl}/${endpoint.layerId}/query`;
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    returnGeometry: 'true',
    f: 'json',
    resultOffset: offset.toString(),
    resultRecordCount: limit.toString(),
  });
  
  const response = await fetch(`${url}?${params}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message);
  }
  
  return {
    features: data.features || [],
    exceededLimit: data.exceededTransferLimit === true,
  };
}

function parseArcGISFeature(feature: any, endpoint: ArcGISEndpoint): CrimeIncident | null {
  const attrs = feature.attributes || {};
  const geom = feature.geometry;
  const mappings = endpoint.fieldMappings;
  
  const offenseType = attrs[mappings.offenseType];
  if (!offenseType) return null;
  
  let incidentDate: Date | null = null;
  const dateValue = attrs[mappings.date];
  if (dateValue) {
    incidentDate = typeof dateValue === 'number' ? new Date(dateValue) : new Date(dateValue);
    if (isNaN(incidentDate.getTime())) incidentDate = null;
  }
  
  let lat: number | null = null;
  let lon: number | null = null;
  
  if (mappings.latitude && mappings.longitude) {
    lat = parseFloat(attrs[mappings.latitude]) || null;
    lon = parseFloat(attrs[mappings.longitude]) || null;
  } else if (geom) {
    lat = geom.y || null;
    lon = geom.x || null;
  }
  
  if (lat === 0) lat = null;
  if (lon === 0) lon = null;
  
  let normalizedType: CrimeMetricKey | null = null;
  if (endpoint.offenseTypeMapping && endpoint.offenseTypeMapping[offenseType]) {
    normalizedType = endpoint.offenseTypeMapping[offenseType] as CrimeMetricKey;
  } else {
    normalizedType = normalizeOffenseType(offenseType);
  }
  
  return {
    city: endpoint.name,
    state: endpoint.state,
    incident_date: incidentDate,
    offense_type: offenseType,
    normalized_type: normalizedType,
    latitude: lat,
    longitude: lon,
    address: mappings.address ? attrs[mappings.address] || null : null,
    case_number: mappings.caseNumber ? attrs[mappings.caseNumber] || null : null,
    source: `arcgis_${endpoint.name.toLowerCase().replace(/\s+/g, '_')}`,
    raw_data: attrs,
  };
}

// ============= Socrata Ingestion =============

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

async function fetchSocrataPage(
  endpoint: SocrataEndpoint,
  offset: number,
  limit: number
): Promise<any[]> {
  const baseUrl = `https://${endpoint.domain}/resource/${endpoint.datasetId}.json`;
  const params = new URLSearchParams({
    '$limit': limit.toString(),
    '$offset': offset.toString(),
    '$order': `${endpoint.fieldMappings.date} DESC`,
  });
  
  const response = await fetch(`${baseUrl}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  return await response.json();
}

function parseSocrataRecord(record: any, endpoint: SocrataEndpoint): CrimeIncident | null {
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
  
  let normalizedType: CrimeMetricKey | null = null;
  if (endpoint.offenseTypeMapping && endpoint.offenseTypeMapping[offenseType]) {
    normalizedType = endpoint.offenseTypeMapping[offenseType] as CrimeMetricKey;
  } else {
    normalizedType = normalizeOffenseType(offenseType);
  }
  
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

// ============= Carto Ingestion =============

async function fetchCartoPage(
  endpoint: CartoEndpoint,
  offset: number,
  limit: number
): Promise<any[]> {
  const sql = `SELECT * FROM ${endpoint.tableName} ORDER BY ${endpoint.fieldMappings.date} DESC LIMIT ${limit} OFFSET ${offset}`;
  const params = new URLSearchParams({ 'q': sql, 'format': 'json' });
  
  const response = await fetch(`${endpoint.baseUrl}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const data = await response.json();
  if (data.error) {
    throw new Error(JSON.stringify(data.error));
  }
  
  return data.rows || [];
}

function parseCartoRecord(record: any, endpoint: CartoEndpoint): CrimeIncident | null {
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
    source: `carto_${endpoint.name.toLowerCase().replace(/\s+/g, '_')}`,
    raw_data: record,
  };
}

// ============= Database Operations =============

async function insertBatch(
  supabase: any,
  incidents: CrimeIncident[]
): Promise<{ inserted: number; errors: number }> {
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
      raw_data: sanitizeForJson(inc.raw_data),
    }));
    
    const { error } = await supabase
      .from('crime_incidents')
      .insert(records as any);
    
    if (error) {
      console.error(`  Batch error: ${error.message}`);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
  }
  
  return { inserted, errors };
}

// ============= Main Ingestion Logic =============

async function ingestArcGIS(
  supabase: any,
  endpoint: ArcGISEndpoint
): Promise<{ fetched: number; inserted: number }> {
  console.log(`\n[ArcGIS] ${endpoint.name}, ${endpoint.state}`);
  console.log(`  URL: ${endpoint.serviceUrl}/${endpoint.layerId}`);
  
  const totalCount = await getTotalRecordCount(endpoint);
  console.log(`  Total records available: ${totalCount.toLocaleString()}`);
  
  let offset = 0;
  let totalFetched = 0;
  let totalInserted = 0;
  
  while (offset < totalCount) {
    try {
      const { features } = await fetchArcGISPage(endpoint, offset, ARCGIS_PAGE_SIZE);
      
      if (features.length === 0) break;
      
      const incidents: CrimeIncident[] = [];
      for (const feature of features) {
        const incident = parseArcGISFeature(feature, endpoint);
        if (incident) incidents.push(incident);
      }
      
      const { inserted } = await insertBatch(supabase, incidents);
      
      offset += features.length;
      totalFetched += features.length;
      totalInserted += inserted;
      
      const pct = ((totalFetched / totalCount) * 100).toFixed(1);
      console.log(`  Progress: ${totalFetched.toLocaleString()}/${totalCount.toLocaleString()} (${pct}%) - Inserted: ${totalInserted.toLocaleString()}`);
      
      if (features.length < ARCGIS_PAGE_SIZE) break;
      
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    } catch (error) {
      console.error(`  Error at offset ${offset}:`, error);
      throw error;
    }
  }
  
  return { fetched: totalFetched, inserted: totalInserted };
}

async function ingestSocrata(
  supabase: any,
  endpoint: SocrataEndpoint
): Promise<{ fetched: number; inserted: number }> {
  console.log(`\n[Socrata] ${endpoint.name}, ${endpoint.state}`);
  console.log(`  Domain: ${endpoint.domain}`);
  console.log(`  Dataset: ${endpoint.datasetId}`);
  
  let offset = 0;
  let totalFetched = 0;
  let totalInserted = 0;
  let hasMore = true;
  
  while (hasMore) {
    try {
      const records = await fetchSocrataPage(endpoint, offset, SOCRATA_PAGE_SIZE);
      
      if (!Array.isArray(records) || records.length === 0) {
        hasMore = false;
        continue;
      }
      
      const incidents: CrimeIncident[] = [];
      for (const record of records) {
        const incident = parseSocrataRecord(record, endpoint);
        if (incident) incidents.push(incident);
      }
      
      const { inserted } = await insertBatch(supabase, incidents);
      
      offset += records.length;
      totalFetched += records.length;
      totalInserted += inserted;
      
      console.log(`  Fetched: ${totalFetched.toLocaleString()}, Inserted: ${totalInserted.toLocaleString()}`);
      
      if (records.length < SOCRATA_PAGE_SIZE) {
        hasMore = false;
      } else {
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS * 2));
      }
    } catch (error) {
      console.error(`  Error at offset ${offset}:`, error);
      throw error;
    }
  }
  
  return { fetched: totalFetched, inserted: totalInserted };
}

async function ingestCarto(
  supabase: any,
  endpoint: CartoEndpoint
): Promise<{ fetched: number; inserted: number }> {
  console.log(`\n[Carto] ${endpoint.name}, ${endpoint.state}`);
  console.log(`  Base URL: ${endpoint.baseUrl}`);
  console.log(`  Table: ${endpoint.tableName}`);
  
  let offset = 0;
  let totalFetched = 0;
  let totalInserted = 0;
  let hasMore = true;
  
  while (hasMore) {
    try {
      const records = await fetchCartoPage(endpoint, offset, CARTO_PAGE_SIZE);
      
      if (!Array.isArray(records) || records.length === 0) {
        hasMore = false;
        continue;
      }
      
      const incidents: CrimeIncident[] = [];
      for (const record of records) {
        const incident = parseCartoRecord(record, endpoint);
        if (incident) incidents.push(incident);
      }
      
      const { inserted } = await insertBatch(supabase, incidents);
      
      offset += records.length;
      totalFetched += records.length;
      totalInserted += inserted;
      
      console.log(`  Fetched: ${totalFetched.toLocaleString()}, Inserted: ${totalInserted.toLocaleString()}`);
      
      if (records.length < CARTO_PAGE_SIZE) {
        hasMore = false;
      } else {
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS * 5)); // Carto needs more delay
      }
    } catch (error) {
      console.error(`  Error at offset ${offset}:`, error);
      throw error;
    }
  }
  
  return { fetched: totalFetched, inserted: totalInserted };
}

async function clearCityData(
  supabase: any,
  cityName: string,
  stateName: string
): Promise<number> {
  console.log(`\n  Clearing existing data for ${cityName}, ${stateName}...`);
  
  const { count, error } = await supabase
    .from('crime_incidents')
    .delete({ count: 'exact' })
    .eq('city', cityName)
    .eq('state', stateName);
  
  if (error) {
    console.error(`  Warning: Error clearing old data: ${error.message}`);
    return 0;
  }
  
  console.log(`  Cleared ${(count || 0).toLocaleString()} existing records`);
  return count || 0;
}

async function processCity(
  supabase: any,
  endpoint: CrimeEndpoint
): Promise<void> {
  const startTime = Date.now();
  
  console.log('\n' + '='.repeat(60));
  console.log(`SCHEDULED INGESTION: ${endpoint.name}, ${endpoint.state}`);
  console.log(`Source Type: ${endpoint.type}`);
  console.log(`Start Time: ${new Date().toISOString()}`);
  console.log('='.repeat(60));
  
  try {
    // Clear existing data first to prevent duplicates
    await clearCityData(supabase, endpoint.name, endpoint.state);
    
    let result: { fetched: number; inserted: number };
    
    switch (endpoint.type) {
      case 'arcgis':
        result = await ingestArcGIS(supabase, endpoint as ArcGISEndpoint);
        break;
      case 'socrata':
        result = await ingestSocrata(supabase, endpoint as SocrataEndpoint);
        break;
      case 'carto':
        result = await ingestCarto(supabase, endpoint as CartoEndpoint);
        break;
      default:
        throw new Error(`Unknown source type: ${endpoint.type}`);
    }
    
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    
    console.log('\n' + '='.repeat(60));
    console.log(`COMPLETE: ${endpoint.name}, ${endpoint.state}`);
    console.log(`Duration: ${duration} minutes`);
    console.log(`Total fetched: ${result.fetched.toLocaleString()}`);
    console.log(`Total inserted: ${result.inserted.toLocaleString()}`);
    console.log('='.repeat(60));
    
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.error(`\nFAILED: ${endpoint.name} after ${duration} minutes`);
    console.error('Error:', error);
    throw error;
  }
}

function listCities(): void {
  console.log('\n=== Available Cities for Scheduled Ingestion ===\n');
  
  const pending = [
    { name: 'Las Vegas', state: 'NV', type: 'arcgis', records: '~423K' },
    { name: 'Virginia Beach', state: 'VA', type: 'arcgis', records: '~175K' },
    { name: 'San Francisco', state: 'CA', type: 'socrata', records: '~985K' },
    { name: 'Oakland', state: 'CA', type: 'socrata', records: '~1.1M' },
    { name: 'San Diego', state: 'CA', type: 'arcgis', records: '~802K' },
    { name: 'Philadelphia', state: 'PA', type: 'carto', records: '~3.4M' },
  ];
  
  console.log('Pending Cities (priority queue):');
  console.log('-'.repeat(60));
  for (const city of pending) {
    console.log(`  ${city.name.padEnd(20)} ${city.state.padEnd(5)} ${city.type.padEnd(10)} ${city.records}`);
  }
  
  console.log('\n\nAll Available Cities:');
  console.log('-'.repeat(60));
  
  const byType: Record<string, CrimeEndpoint[]> = {
    socrata: SOCRATA_ENDPOINTS,
    arcgis: ARCGIS_ENDPOINTS,
    carto: CARTO_ENDPOINTS,
    ckan: CKAN_ENDPOINTS,
  };
  
  for (const [type, endpoints] of Object.entries(byType)) {
    console.log(`\n${type.toUpperCase()} (${endpoints.length} cities):`);
    for (const ep of endpoints) {
      console.log(`  ${ep.name}, ${ep.state}`);
    }
  }
  
  console.log(`\n\nTotal: ${ALL_ENDPOINTS.length} cities available`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--list') || args.includes('-l')) {
    listCities();
    return;
  }
  
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log('Usage:');
    console.log('  npx tsx scripts/scheduled-crime-ingestion.ts "Las Vegas"');
    console.log('  npx tsx scripts/scheduled-crime-ingestion.ts "San Francisco"');
    console.log('  npx tsx scripts/scheduled-crime-ingestion.ts --list');
    console.log('\nDesigned to run as a Scheduled Deployment for long-running ingestion.');
    return;
  }
  
  const cityName = args[0];
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Find the endpoint
  const endpoint = ALL_ENDPOINTS.find(
    ep => ep.name.toLowerCase() === cityName.toLowerCase()
  );
  
  if (!endpoint) {
    console.error(`City not found: ${cityName}`);
    console.log('\nUse --list to see available cities');
    process.exit(1);
  }
  
  await processCity(supabase, endpoint);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
