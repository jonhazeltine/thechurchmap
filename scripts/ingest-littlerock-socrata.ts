#!/usr/bin/env npx tsx
/**
 * Little Rock Crime Data Ingestion (Socrata)
 * 
 * Source: City of Little Rock Open Data
 * Endpoint: https://data.littlerock.gov/resource/bz82-34ep.json
 * Dataset: Little Rock Police Department Statistics 2017 to Year to Date
 * Records: ~130,000+
 * 
 * Usage: npx tsx scripts/ingest-littlerock-socrata.ts
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

const DATASET_ID = 'bz82-34ep';
const BASE_URL = `https://data.littlerock.gov/resource/${DATASET_ID}.json`;
const BATCH_SIZE = 1000;
const PAGE_SIZE = 5000;
const RATE_LIMIT_MS = 200;

interface LittleRockRecord {
  incident_number: string;
  incident_date: string;
  offense_description: string;
  offense_code?: string;
  offense_status?: string;
  latitude?: string;
  longitude?: string;
  incident_location?: string;
  city?: string;
  state?: string;
  zip?: string;
  location_district?: string;
  weapon_type?: string;
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

async function fetchPage(offset: number): Promise<LittleRockRecord[]> {
  const url = `${BASE_URL}?$limit=${PAGE_SIZE}&$offset=${offset}&$order=incident_date DESC`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

async function getTotalCount(): Promise<number> {
  const url = `${BASE_URL}?$select=count(*)`;
  const response = await fetch(url);
  const data = await response.json();
  return parseInt(data[0]?.count || '0', 10);
}

function parseRecord(record: LittleRockRecord): CrimeIncident | null {
  const offenseType = record.offense_description;
  if (!offenseType) return null;
  
  let incidentDate: Date | null = null;
  if (record.incident_date) {
    incidentDate = new Date(record.incident_date);
    if (isNaN(incidentDate.getTime())) incidentDate = null;
  }
  
  const lat = record.latitude ? parseFloat(record.latitude) : null;
  const lng = record.longitude ? parseFloat(record.longitude) : null;
  
  const address = record.incident_location || null;
  
  return {
    city: 'Little Rock',
    state: 'AR',
    incident_date: incidentDate,
    offense_type: offenseType,
    normalized_type: normalizeOffenseType(offenseType),
    latitude: lat,
    longitude: lng,
    address: address,
    case_number: record.incident_number || null,
    source: 'socrata_littlerock',
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
  }
  
  return { inserted, errors };
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         LITTLE ROCK CRIME DATA INGESTION (Socrata)         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  const totalRecords = await getTotalCount();
  console.log(`\nTotal records available: ${totalRecords.toLocaleString()}\n`);
  
  let offset = 0;
  let totalFetched = 0;
  let totalInserted = 0;
  let totalErrors = 0;
  let hasMore = true;
  
  while (hasMore) {
    try {
      console.log(`Fetching records at offset ${offset.toLocaleString()}...`);
      const records = await fetchPage(offset);
      
      if (records.length === 0) {
        hasMore = false;
        continue;
      }
      
      const incidents: CrimeIncident[] = [];
      for (const record of records) {
        const incident = parseRecord(record);
        if (incident) {
          incidents.push(incident);
        }
      }
      
      totalFetched += records.length;
      console.log(`  Parsed ${incidents.length}/${records.length} records`);
      
      const { inserted, errors } = await insertIncidents(incidents);
      totalInserted += inserted;
      totalErrors += errors;
      
      console.log(`  Progress: ${totalFetched.toLocaleString()}/${totalRecords.toLocaleString()} (${((totalFetched/totalRecords)*100).toFixed(1)}%)`);
      
      if (records.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += records.length;
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`Error at offset ${offset}: ${err.message}`);
      await new Promise(r => setTimeout(r, 2000));
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
}

main().catch(console.error);
