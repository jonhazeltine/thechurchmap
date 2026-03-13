#!/usr/bin/env npx tsx
/**
 * Resume Crime Data Ingestion Script
 * 
 * Smart script that checks current record counts and resumes incomplete ingestion.
 * Focuses on cities that didn't complete: Philadelphia, Oakland, San Diego
 * 
 * Usage:
 *   npx tsx scripts/resume-crime-ingestion.ts --check-only     # Show status only
 *   npx tsx scripts/resume-crime-ingestion.ts                   # Resume all incomplete
 *   npx tsx scripts/resume-crime-ingestion.ts --city "Philadelphia"  # Resume specific city
 *   npx tsx scripts/resume-crime-ingestion.ts --city "Philadelphia" --clear  # Clear and re-ingest
 * 
 * Features:
 * - Checks current DB counts vs API totals
 * - Only processes cities that need more data
 * - Aggressive rate limiting to prevent Supabase overload
 * - Supports incremental ingestion (doesn't clear existing data by default)
 */

import { createClient } from '@supabase/supabase-js';
import { 
  ARCGIS_ENDPOINTS, 
  SOCRATA_ENDPOINTS, 
  CARTO_ENDPOINTS,
  ArcGISEndpoint,
  SocrataEndpoint,
  CartoEndpoint,
  normalizeOffenseType,
  CrimeMetricKey,
} from './config/crime-sources';

// AGGRESSIVE RATE LIMITING to prevent Supabase overload
const BATCH_SIZE = 500;           // Smaller batches
const ARCGIS_PAGE_SIZE = 1000;    // Smaller pages
const SOCRATA_PAGE_SIZE = 10000;  // Smaller pages  
const CARTO_PAGE_SIZE = 10000;    // Smaller pages
const RATE_LIMIT_MS = 500;        // Longer delay between API calls
const BATCH_DELAY_MS = 200;       // Delay between DB inserts
const PROGRESS_INTERVAL = 10000;  // Log progress every 10K records

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

interface CityStatus {
  city: string;
  state: string;
  type: string;
  currentCount: number;
  apiTotal: number | null;
  status: 'complete' | 'incomplete' | 'unknown';
  remaining: number | null;
}

// Target cities that may need resumption or re-ingestion
const TARGET_CITIES = [
  { name: 'New York City', state: 'NY', type: 'socrata' as const, expectedMin: 400000, forceReingest: true },
  { name: 'San Diego', state: 'CA', type: 'socrata' as const, expectedMin: 500000 },
  { name: 'Philadelphia', state: 'PA', type: 'carto' as const, expectedMin: 3000000 },
];

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

// ============= Database Operations =============

async function getCurrentCount(supabase: any, city: string, state: string): Promise<number> {
  const { count, error } = await supabase
    .from('crime_incidents')
    .select('*', { count: 'exact', head: true })
    .eq('city', city)
    .eq('state', state);
  
  if (error) {
    console.error(`Error getting count for ${city}, ${state}:`, error.message);
    return 0;
  }
  return count || 0;
}

async function clearCityData(supabase: any, city: string, state: string): Promise<number> {
  const { count } = await supabase
    .from('crime_incidents')
    .select('*', { count: 'exact', head: true })
    .eq('city', city)
    .eq('state', state);
  
  console.log(`Clearing ${count || 0} existing records for ${city}, ${state}...`);
  
  // Delete in batches to avoid timeout
  let deleted = 0;
  while (true) {
    const { error, count: deleteCount } = await supabase
      .from('crime_incidents')
      .delete()
      .eq('city', city)
      .eq('state', state)
      .limit(10000);
    
    if (error) {
      console.error(`Error deleting:`, error.message);
      break;
    }
    
    if (!deleteCount || deleteCount === 0) break;
    deleted += deleteCount;
    console.log(`  Deleted ${deleted} records...`);
    await new Promise(r => setTimeout(r, 100));
  }
  
  return deleted;
}

async function upsertIncidents(
  supabase: any, 
  incidents: CrimeIncident[],
  onProgress?: (inserted: number) => void
): Promise<{ inserted: number; errors: number }> {
  let inserted = 0;
  let errors = 0;
  
  for (let i = 0; i < incidents.length; i += BATCH_SIZE) {
    const batch = incidents.slice(i, i + BATCH_SIZE).map(inc => ({
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
      .insert(batch as any);
    
    if (error) {
      console.error(`  Batch error at ${i}:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
    
    if (inserted % PROGRESS_INTERVAL < BATCH_SIZE) {
      console.log(`  Inserted ${inserted}/${incidents.length} records...`);
      onProgress?.(inserted);
    }
    
    await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }
  
  return { inserted, errors };
}

// ============= ArcGIS (San Diego) =============

async function getArcGISTotal(endpoint: ArcGISEndpoint): Promise<number> {
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
  
  const normalizedType = normalizeOffenseType(offenseType);
  
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

async function ingestArcGIS(
  supabase: any,
  endpoint: ArcGISEndpoint,
  startOffset: number = 0
): Promise<{ fetched: number; inserted: number }> {
  console.log(`\n📍 Ingesting ${endpoint.name}, ${endpoint.state} (ArcGIS)`);
  console.log(`  Service URL: ${endpoint.serviceUrl}`);
  console.log(`  Starting from offset: ${startOffset}`);
  
  const total = await getArcGISTotal(endpoint);
  console.log(`  API Total: ${total.toLocaleString()} records`);
  
  let offset = startOffset;
  let totalFetched = 0;
  let totalInserted = 0;
  
  while (true) {
    try {
      const { features, exceededLimit } = await fetchArcGISPage(endpoint, offset, ARCGIS_PAGE_SIZE);
      
      if (features.length === 0) break;
      
      const incidents: CrimeIncident[] = [];
      for (const feature of features) {
        const incident = parseArcGISFeature(feature, endpoint);
        if (incident) incidents.push(incident);
      }
      
      totalFetched += features.length;
      
      const { inserted, errors } = await upsertIncidents(supabase, incidents);
      totalInserted += inserted;
      
      console.log(`  Offset ${offset}: fetched ${features.length}, inserted ${inserted}, total ${totalFetched}/${total}`);
      
      if (!exceededLimit || features.length < ARCGIS_PAGE_SIZE) break;
      
      offset += features.length;
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
      
    } catch (error) {
      console.error(`  Error at offset ${offset}:`, error);
      break;
    }
  }
  
  console.log(`  ✅ Complete: ${totalFetched} fetched, ${totalInserted} inserted`);
  return { fetched: totalFetched, inserted: totalInserted };
}

// ============= Socrata (Oakland) =============

async function getSocrataTotal(endpoint: SocrataEndpoint): Promise<number> {
  // Don't use URLSearchParams - it encodes $ which breaks Socrata APIs
  const url = `https://${endpoint.domain}/resource/${endpoint.datasetId}.json?$select=count(*)`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`  getSocrataTotal HTTP error: ${response.status}`);
      return 0;
    }
    const data = await response.json();
    // Handle both formats: [{"count":"123"}] or [{"count":123}]
    const countValue = data[0]?.count;
    return typeof countValue === 'string' ? parseInt(countValue, 10) : (countValue || 0);
  } catch (err) {
    console.error(`  getSocrataTotal error:`, err);
    return 0;
  }
}

async function fetchSocrataPage(
  endpoint: SocrataEndpoint,
  offset: number,
  limit: number
): Promise<any[]> {
  // Don't use URLSearchParams - it encodes $ which breaks Socrata APIs
  const dateField = endpoint.fieldMappings.date;
  const url = `https://${endpoint.domain}/resource/${endpoint.datasetId}.json?$limit=${limit}&$offset=${offset}&$order=${encodeURIComponent(dateField + ' DESC')}`;
  
  const response = await fetch(url);
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
    source: `socrata_${endpoint.name.toLowerCase().replace(/\s+/g, '_')}`,
    raw_data: record,
  };
}

async function ingestSocrata(
  supabase: any,
  endpoint: SocrataEndpoint,
  startOffset: number = 0
): Promise<{ fetched: number; inserted: number }> {
  console.log(`\n📍 Ingesting ${endpoint.name}, ${endpoint.state} (Socrata)`);
  console.log(`  Domain: ${endpoint.domain}`);
  console.log(`  Dataset: ${endpoint.datasetId}`);
  console.log(`  Starting from offset: ${startOffset}`);
  
  const total = await getSocrataTotal(endpoint);
  console.log(`  API Total: ${total.toLocaleString()} records`);
  
  let offset = startOffset;
  let totalFetched = 0;
  let totalInserted = 0;
  
  while (true) {
    try {
      const records = await fetchSocrataPage(endpoint, offset, SOCRATA_PAGE_SIZE);
      
      if (!records || records.length === 0) break;
      
      const incidents: CrimeIncident[] = [];
      for (const record of records) {
        const incident = parseSocrataRecord(record, endpoint);
        if (incident) incidents.push(incident);
      }
      
      totalFetched += records.length;
      
      const { inserted, errors } = await upsertIncidents(supabase, incidents);
      totalInserted += inserted;
      
      console.log(`  Offset ${offset}: fetched ${records.length}, inserted ${inserted}, total ${totalFetched}/${total}`);
      
      if (records.length < SOCRATA_PAGE_SIZE) break;
      
      offset += records.length;
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
      
    } catch (error) {
      console.error(`  Error at offset ${offset}:`, error);
      break;
    }
  }
  
  console.log(`  ✅ Complete: ${totalFetched} fetched, ${totalInserted} inserted`);
  return { fetched: totalFetched, inserted: totalInserted };
}

// ============= Carto (Philadelphia) =============

async function getCartoTotal(endpoint: CartoEndpoint): Promise<number> {
  const sql = `SELECT COUNT(*) as count FROM ${endpoint.tableName}`;
  const params = new URLSearchParams({ q: sql, format: 'json' });
  
  try {
    const response = await fetch(`${endpoint.baseUrl}?${params}`);
    const data = await response.json();
    return parseInt(data.rows?.[0]?.count || '0', 10);
  } catch {
    return 0;
  }
}

function buildCartoUrl(endpoint: CartoEndpoint, offset: number, limit: number): string {
  const sql = `SELECT * FROM ${endpoint.tableName} ORDER BY ${endpoint.fieldMappings.date} DESC LIMIT ${limit} OFFSET ${offset}`;
  const params = new URLSearchParams({ q: sql, format: 'json' });
  return `${endpoint.baseUrl}?${params}`;
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
  const caseNumber = mappings.caseNumber ? record[mappings.caseNumber] : null;
  const uniqueId = caseNumber || `${record.cartodb_id || ''}_${dateValue || ''}`;
  
  return {
    city: endpoint.name,
    state: endpoint.state,
    incident_date: incidentDate,
    offense_type: offenseType,
    normalized_type: normalizedType,
    latitude: lat,
    longitude: lon,
    address: mappings.address ? record[mappings.address] || null : null,
    case_number: uniqueId,
    source: `carto_${endpoint.name.toLowerCase().replace(/\s+/g, '_')}`,
    raw_data: record,
  };
}

async function ingestCarto(
  supabase: any,
  endpoint: CartoEndpoint,
  startOffset: number = 0
): Promise<{ fetched: number; inserted: number }> {
  console.log(`\n📍 Ingesting ${endpoint.name}, ${endpoint.state} (Carto)`);
  console.log(`  Base URL: ${endpoint.baseUrl}`);
  console.log(`  Table: ${endpoint.tableName}`);
  console.log(`  Starting from offset: ${startOffset}`);
  
  const total = await getCartoTotal(endpoint);
  console.log(`  API Total: ${total.toLocaleString()} records`);
  
  let offset = startOffset;
  let totalFetched = 0;
  let totalInserted = 0;
  
  while (true) {
    try {
      const url = buildCartoUrl(endpoint, offset, CARTO_PAGE_SIZE);
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`  HTTP Error: ${response.status}`);
        break;
      }
      
      const data = await response.json();
      const records = data.rows || [];
      
      if (!records || records.length === 0) break;
      
      const incidents: CrimeIncident[] = [];
      for (const record of records) {
        const incident = parseCartoRecord(record, endpoint);
        if (incident) incidents.push(incident);
      }
      
      totalFetched += records.length;
      
      const { inserted, errors } = await upsertIncidents(supabase, incidents);
      totalInserted += inserted;
      
      console.log(`  Offset ${offset}: fetched ${records.length}, inserted ${inserted}, total ${totalFetched}/${total}`);
      
      if (records.length < CARTO_PAGE_SIZE) break;
      
      offset += records.length;
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
      
    } catch (error) {
      console.error(`  Error at offset ${offset}:`, error);
      break;
    }
  }
  
  console.log(`  ✅ Complete: ${totalFetched} fetched, ${totalInserted} inserted`);
  return { fetched: totalFetched, inserted: totalInserted };
}

// ============= Status Check =============

async function checkCityStatus(supabase: any): Promise<CityStatus[]> {
  const statuses: CityStatus[] = [];
  
  for (const target of TARGET_CITIES) {
    const currentCount = await getCurrentCount(supabase, target.name, target.state);
    let apiTotal: number | null = null;
    
    // Get API total based on type
    if (target.type === 'socrata') {
      const endpoint = SOCRATA_ENDPOINTS.find(e => e.name === target.name);
      if (endpoint) {
        apiTotal = await getSocrataTotal(endpoint);
      }
    } else if (target.type === 'carto') {
      const endpoint = CARTO_ENDPOINTS.find(e => e.name === target.name);
      if (endpoint) {
        apiTotal = await getCartoTotal(endpoint);
      }
    }
    
    const remaining = apiTotal !== null ? Math.max(0, apiTotal - currentCount) : null;
    const completionPct = apiTotal ? (currentCount / apiTotal * 100) : 0;
    
    let status: 'complete' | 'incomplete' | 'unknown' = 'unknown';
    if (apiTotal !== null) {
      status = completionPct >= 95 ? 'complete' : 'incomplete';
    }
    
    statuses.push({
      city: target.name,
      state: target.state,
      type: target.type,
      currentCount,
      apiTotal,
      status,
      remaining,
    });
  }
  
  return statuses;
}

function printStatus(statuses: CityStatus[]) {
  console.log('\n📊 City Ingestion Status:');
  console.log('─'.repeat(80));
  console.log('City'.padEnd(20) + 'State'.padEnd(8) + 'Type'.padEnd(10) + 'Current'.padEnd(12) + 'API Total'.padEnd(12) + 'Remaining'.padEnd(12) + 'Status');
  console.log('─'.repeat(80));
  
  for (const s of statuses) {
    const statusIcon = s.status === 'complete' ? '✅' : s.status === 'incomplete' ? '❌' : '❓';
    console.log(
      s.city.padEnd(20) +
      s.state.padEnd(8) +
      s.type.padEnd(10) +
      s.currentCount.toLocaleString().padEnd(12) +
      (s.apiTotal?.toLocaleString() || 'N/A').padEnd(12) +
      (s.remaining?.toLocaleString() || 'N/A').padEnd(12) +
      statusIcon + ' ' + s.status
    );
  }
  console.log('─'.repeat(80));
}

// ============= Main =============

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check-only');
  const clearData = args.includes('--clear');
  const cityIndex = args.indexOf('--city');
  const targetCity = cityIndex >= 0 ? args[cityIndex + 1] : null;
  
  console.log('🔄 Resume Crime Ingestion Script');
  console.log('================================');
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Check status first
  console.log('\nChecking current status...');
  const statuses = await checkCityStatus(supabase);
  printStatus(statuses);
  
  if (checkOnly) {
    console.log('\n✅ Check complete (--check-only mode)');
    return;
  }
  
  // Filter to incomplete cities
  let citiesToProcess = statuses.filter(s => s.status === 'incomplete');
  
  if (targetCity) {
    citiesToProcess = citiesToProcess.filter(s => 
      s.city.toLowerCase() === targetCity.toLowerCase()
    );
    if (citiesToProcess.length === 0) {
      console.log(`\n⚠️ City "${targetCity}" not found or already complete`);
      return;
    }
  }
  
  if (citiesToProcess.length === 0) {
    console.log('\n✅ All target cities are complete!');
    return;
  }
  
  console.log(`\n🚀 Processing ${citiesToProcess.length} incomplete cities...`);
  
  for (const city of citiesToProcess) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${city.city}, ${city.state}`);
    console.log(`Current: ${city.currentCount.toLocaleString()} / API Total: ${city.apiTotal?.toLocaleString() || 'N/A'}`);
    console.log(`${'='.repeat(60)}`);
    
    // Check if this city needs force re-ingestion (e.g., NYC)
    const targetConfig = TARGET_CITIES.find(t => t.name === city.city);
    const shouldClear = clearData || (targetConfig as any)?.forceReingest;
    
    if (shouldClear) {
      await clearCityData(supabase, city.city, city.state);
    }
    
    try {
      if (city.type === 'socrata') {
        const endpoint = SOCRATA_ENDPOINTS.find(e => e.name === city.city);
        if (endpoint) {
          await ingestSocrata(supabase, endpoint, shouldClear ? 0 : city.currentCount);
        }
      } else if (city.type === 'carto') {
        const endpoint = CARTO_ENDPOINTS.find(e => e.name === city.city);
        if (endpoint) {
          await ingestCarto(supabase, endpoint, shouldClear ? 0 : city.currentCount);
        }
      }
    } catch (error) {
      console.error(`\n❌ Error processing ${city.city}:`, error);
    }
  }
  
  // Final status check
  console.log('\n\n📊 Final Status:');
  const finalStatuses = await checkCityStatus(supabase);
  printStatus(finalStatuses);
  
  console.log('\n✅ Resume ingestion complete!');
}

main().catch(console.error);
