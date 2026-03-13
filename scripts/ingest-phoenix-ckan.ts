#!/usr/bin/env npx tsx
/**
 * Phoenix Crime Data Ingestion (CKAN API)
 * 
 * Source: Phoenix Open Data Portal (CKAN)
 * Endpoint: https://www.phoenixopendata.com/api/3/action/datastore_search
 * Records: ~605,000+
 * 
 * NOTE: This dataset does NOT include lat/lng coordinates.
 * It has "100 BLOCK ADDR" + "ZIP" which could be geocoded later.
 * 
 * Usage: npx tsx scripts/ingest-phoenix-ckan.ts
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

const PHOENIX_RESOURCE_ID = '0ce3411a-2fc6-4302-a33f-167f68608a20';
const BATCH_SIZE = 1000;
const PAGE_SIZE = 10000;
const RATE_LIMIT_MS = 300;

interface PhoenixRecord {
  '_id': number;
  'INC NUMBER': string;
  'OCCURRED ON': string;
  'OCCURRED TO': string | null;
  'UCR CRIME CATEGORY': string;
  '100 BLOCK ADDR': string;
  'ZIP': string;
  'PREMISE TYPE': string;
  'GRID': string;
}

interface CrimeIncident {
  city: string;
  state: string;
  incident_date: Date | null;
  offense_type: string;
  normalized_type: CrimeMetricKey | null;
  address: string | null;
  case_number: string | null;
  source: string;
  raw_data: Record<string, unknown>;
}

async function fetchCKANData(offset: number): Promise<{ records: PhoenixRecord[]; total: number }> {
  const url = `https://www.phoenixopendata.com/api/3/action/datastore_search?resource_id=${PHOENIX_RESOURCE_ID}&limit=${PAGE_SIZE}&offset=${offset}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(`CKAN API error: ${data.error?.message || 'Unknown error'}`);
  }
  
  return {
    records: data.result.records as PhoenixRecord[],
    total: data.result.total as number,
  };
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  // Format: "11/01/2015  00:00" or "MM/DD/YYYY  HH:MM"
  const parts = dateStr.trim().split(/\s+/);
  const datePart = parts[0];
  const timePart = parts[1] || '00:00';
  
  const [month, day, year] = datePart.split('/');
  const [hour, minute] = timePart.split(':');
  
  const date = new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour) || 0,
    parseInt(minute) || 0
  );
  
  if (isNaN(date.getTime())) return null;
  return date;
}

function parseRecord(record: PhoenixRecord): CrimeIncident | null {
  const offenseType = record['UCR CRIME CATEGORY'];
  if (!offenseType) return null;
  
  const incidentDate = parseDate(record['OCCURRED ON']);
  const address = record['100 BLOCK ADDR'] 
    ? `${record['100 BLOCK ADDR']}, Phoenix, AZ ${record['ZIP'] || ''}`.trim()
    : null;
  
  return {
    city: 'Phoenix',
    state: 'AZ',
    incident_date: incidentDate,
    offense_type: offenseType,
    normalized_type: normalizeOffenseType(offenseType),
    address: address,
    case_number: record['INC NUMBER'] || null,
    source: 'ckan_phoenix',
    raw_data: record as unknown as Record<string, unknown>,
  };
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
      location: null, // No lat/lng available - would need geocoding
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
  }
  
  return { inserted, errors };
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║            PHOENIX CRIME DATA INGESTION (CKAN)             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\nNOTE: This data does NOT include lat/lng coordinates.');
  console.log('      Records have address + ZIP for potential geocoding.\n');
  
  let offset = 0;
  let totalFetched = 0;
  let totalInserted = 0;
  let totalErrors = 0;
  let hasMore = true;
  let totalRecords = 0;
  
  while (hasMore) {
    try {
      console.log(`Fetching records at offset ${offset.toLocaleString()}...`);
      const { records, total } = await fetchCKANData(offset);
      
      if (offset === 0) {
        totalRecords = total;
        console.log(`Total records available: ${totalRecords.toLocaleString()}\n`);
      }
      
      if (records.length === 0) {
        hasMore = false;
        continue;
      }
      
      // Parse records
      const incidents: CrimeIncident[] = [];
      for (const record of records) {
        const incident = parseRecord(record);
        if (incident) {
          incidents.push(incident);
        }
      }
      
      totalFetched += records.length;
      console.log(`  Parsed ${incidents.length}/${records.length} records`);
      
      // Insert batch
      const { inserted, errors } = await insertIncidents(incidents);
      totalInserted += inserted;
      totalErrors += errors;
      
      console.log(`  Progress: ${totalFetched.toLocaleString()}/${totalRecords.toLocaleString()} (${((totalFetched/totalRecords)*100).toFixed(1)}%)`);
      
      if (records.length < PAGE_SIZE || totalFetched >= totalRecords) {
        hasMore = false;
      } else {
        offset += records.length;
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`Error at offset ${offset}: ${err.message}`);
      await new Promise(r => setTimeout(r, 2000));
      // Try to continue
      offset += PAGE_SIZE;
      if (offset >= totalRecords) hasMore = false;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('INGESTION COMPLETE');
  console.log('='.repeat(60));
  console.log(`  Total fetched: ${totalFetched.toLocaleString()}`);
  console.log(`  Total inserted: ${totalInserted.toLocaleString()}`);
  console.log(`  Errors: ${totalErrors}`);
  console.log('='.repeat(60));
  console.log('\nNOTE: Records do not have coordinates. To add locations:');
  console.log('      1. Use the address field for geocoding');
  console.log('      2. Update the location column with geocoded results');
}

main().catch(console.error);
