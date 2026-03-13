#!/usr/bin/env npx tsx
/**
 * Ingest Remaining Socrata Cities
 * 
 * Cities to ingest (verified working endpoints Dec 2025):
 * - Austin, TX
 * - New York, NY (NYPD)
 * - Little Rock, AR
 * - Orlando, FL
 * 
 * Usage: npx tsx scripts/ingest-remaining-socrata.ts [city]
 * Examples:
 *   npx tsx scripts/ingest-remaining-socrata.ts          # All cities
 *   npx tsx scripts/ingest-remaining-socrata.ts austin   # Just Austin
 *   npx tsx scripts/ingest-remaining-socrata.ts newyork  # Just New York
 */

import { createClient } from '@supabase/supabase-js';
import { normalizeOffenseType, CrimeMetricKey } from './config/crime-sources';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const BATCH_SIZE = 1000;
const PAGE_SIZE = 50000;
const RATE_LIMIT_MS = 200;

interface SocrataCity {
  name: string;
  key: string;
  state: string;
  domain: string;
  datasetId: string;
  fieldMappings: {
    date: string;
    offenseType: string;
    latitude?: string;
    longitude?: string;
    address?: string;
    caseNumber?: string;
  };
}

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
  raw_data: Record<string, unknown>;
}

const CITIES: SocrataCity[] = [
  {
    name: 'Austin',
    key: 'austin',
    state: 'TX',
    domain: 'data.austintexas.gov',
    datasetId: 'fdj4-gpfu',
    fieldMappings: {
      date: 'occ_date_time',
      offenseType: 'crime_type',
      latitude: 'latitude',
      longitude: 'longitude',
      address: 'address',
    },
  },
  {
    name: 'New York',
    key: 'newyork',
    state: 'NY',
    domain: 'data.cityofnewyork.us',
    datasetId: '5uac-w243',
    fieldMappings: {
      date: 'cmplnt_fr_dt',
      offenseType: 'ofns_desc',
      latitude: 'latitude',
      longitude: 'longitude',
      address: 'prem_typ_desc',
    },
  },
  {
    name: 'Little Rock',
    key: 'littlerock',
    state: 'AR',
    domain: 'data.littlerock.gov',
    datasetId: 'pwb5-x5a8',
    fieldMappings: {
      date: 'offense_datetime',
      offenseType: 'offense',
      latitude: 'latitude',
      longitude: 'longitude',
      address: 'address',
    },
  },
  {
    name: 'Orlando',
    key: 'orlando',
    state: 'FL',
    domain: 'data.cityoforlando.net',
    datasetId: '4sa4-e8ct',
    fieldMappings: {
      date: 'incident_datetime',
      offenseType: 'offense_type',
      latitude: 'latitude',
      longitude: 'longitude',
      address: 'location',
    },
  },
];

function buildUrl(city: SocrataCity, offset: number): string {
  const baseUrl = `https://${city.domain}/resource/${city.datasetId}.json`;
  const params = new URLSearchParams({
    '$limit': PAGE_SIZE.toString(),
    '$offset': offset.toString(),
    '$order': `${city.fieldMappings.date} DESC`,
  });
  return `${baseUrl}?${params.toString()}`;
}

function parseIncident(record: Record<string, unknown>, city: SocrataCity): CrimeIncident | null {
  const mappings = city.fieldMappings;
  
  const offenseType = record[mappings.offenseType] as string;
  if (!offenseType) return null;
  
  let incidentDate: Date | null = null;
  const dateValue = record[mappings.date] as string;
  if (dateValue) {
    incidentDate = new Date(dateValue);
    if (isNaN(incidentDate.getTime())) incidentDate = null;
  }
  
  let lat: number | null = null;
  let lon: number | null = null;
  
  if (mappings.latitude && mappings.longitude) {
    lat = parseFloat(record[mappings.latitude] as string) || null;
    lon = parseFloat(record[mappings.longitude] as string) || null;
  }
  
  if (lat === 0) lat = null;
  if (lon === 0) lon = null;
  
  const normalizedType = normalizeOffenseType(offenseType);
  
  return {
    city: city.name,
    state: city.state,
    incident_date: incidentDate,
    offense_type: offenseType,
    normalized_type: normalizedType,
    latitude: lat,
    longitude: lon,
    address: mappings.address ? (record[mappings.address] as string) || null : null,
    case_number: mappings.caseNumber ? (record[mappings.caseNumber] as string) || null : null,
    source: `socrata_${city.name.toLowerCase().replace(/\s+/g, '_')}`,
    raw_data: record,
  };
}

async function fetchData(city: SocrataCity): Promise<CrimeIncident[]> {
  const allIncidents: CrimeIncident[] = [];
  let offset = 0;
  let hasMore = true;
  
  console.log(`Fetching from ${city.name}, ${city.state}...`);
  console.log(`  Domain: ${city.domain}`);
  console.log(`  Dataset: ${city.datasetId}`);
  
  while (hasMore) {
    const url = buildUrl(city, offset);
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`  HTTP Error: ${response.status} ${response.statusText}`);
        break;
      }
      
      const records = await response.json() as Record<string, unknown>[];
      
      if (!Array.isArray(records) || records.length === 0) {
        hasMore = false;
        continue;
      }
      
      for (const record of records) {
        const incident = parseIncident(record, city);
        if (incident) {
          allIncidents.push(incident);
        }
      }
      
      const fetched = offset + records.length;
      console.log(`  Fetched ${fetched.toLocaleString()} records (${allIncidents.length.toLocaleString()} parsed)...`);
      
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
  
  console.log(`  Total incidents: ${allIncidents.length.toLocaleString()}`);
  return allIncidents;
}

async function insertIncidents(incidents: CrimeIncident[]): Promise<{ inserted: number; errors: number }> {
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
    
    const { error } = await supabase
      .from('crime_incidents')
      .insert(records);
    
    if (error) {
      console.error(`  Error inserting batch at ${i}: ${error.message}`);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
    
    if ((i + BATCH_SIZE) % 10000 === 0 || i + BATCH_SIZE >= incidents.length) {
      console.log(`  Inserted ${Math.min(i + BATCH_SIZE, incidents.length).toLocaleString()}/${incidents.length.toLocaleString()}`);
    }
  }
  
  return { inserted, errors };
}

async function ingestCity(city: SocrataCity): Promise<number> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Ingesting: ${city.name}, ${city.state}`);
  console.log('='.repeat(60));
  
  const incidents = await fetchData(city);
  
  if (incidents.length === 0) {
    console.log(`  No data to insert for ${city.name}`);
    return 0;
  }
  
  console.log(`\nInserting ${incidents.length.toLocaleString()} records...`);
  const { inserted, errors } = await insertIncidents(incidents);
  
  console.log(`\n✅ ${city.name}: ${inserted.toLocaleString()} inserted, ${errors} errors`);
  return inserted;
}

async function main() {
  const args = process.argv.slice(2);
  const cityFilter = args[0]?.toLowerCase();
  
  let citiesToIngest = CITIES;
  
  if (cityFilter) {
    citiesToIngest = CITIES.filter(c => 
      c.key === cityFilter || 
      c.name.toLowerCase() === cityFilter ||
      c.name.toLowerCase().replace(/\s+/g, '') === cityFilter
    );
    if (citiesToIngest.length === 0) {
      console.error(`City not found: ${cityFilter}`);
      console.log('Available cities:', CITIES.map(c => `${c.key} (${c.name})`).join(', '));
      process.exit(1);
    }
  }
  
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          REMAINING SOCRATA CITIES INGESTION                ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nCities to ingest: ${citiesToIngest.map(c => c.name).join(', ')}`);
  
  const results: { city: string; count: number }[] = [];
  
  for (const city of citiesToIngest) {
    const count = await ingestCity(city);
    results.push({ city: city.name, count });
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('INGESTION SUMMARY');
  console.log('='.repeat(60));
  
  let grandTotal = 0;
  for (const { city, count } of results) {
    console.log(`  ${city}: ${count.toLocaleString()}`);
    grandTotal += count;
  }
  
  console.log('-'.repeat(60));
  console.log(`  TOTAL: ${grandTotal.toLocaleString()} records`);
  console.log('='.repeat(60));
}

main().catch(console.error);
