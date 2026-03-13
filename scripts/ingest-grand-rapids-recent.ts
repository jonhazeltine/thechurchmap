#!/usr/bin/env npx tsx
/**
 * Grand Rapids Recent Crime Data Ingestion
 * 
 * Focused script to ingest only 2022-2025 crime data from Grand Rapids.
 * Uses date filtering in the ArcGIS query for faster processing.
 * 
 * Usage:
 *   npx tsx scripts/ingest-grand-rapids-recent.ts
 */

import { createClient } from '@supabase/supabase-js';

const BATCH_SIZE = 1000;
const PAGE_SIZE = 2000;

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const GRAND_RAPIDS_CONFIG = {
  name: 'Grand Rapids',
  state: 'MI',
  serviceUrl: 'https://services2.arcgis.com/L81TiOwAPO1ZvU9b/arcgis/rest/services/CRIME_DALLLLLLL/FeatureServer',
  layerId: 0,
  dateField: 'USER_DATEOFOFFENSE',
  offenseField: 'USER_NIBRS_GRP',
  caseField: 'USER_INCNUMBER',
  offenseMapping: {
    'Assault Offenses': 'assault_rate',
    'Sex Offenses': 'sex_offense_rate',
    'Robbery': 'robbery_rate',
    'Larceny/Theft Offenses': 'theft_rate',
    'Burglary/Breaking & Entering': 'burglary_rate',
    'Motor Vehicle Theft': 'vehicle_theft_rate',
    'Destruction/Damage/Vandalism of Property': 'vandalism_rate',
    'Fraud Offenses': 'fraud_rate',
    'Drug/Narcotic Offenses': 'drug_offense_rate',
    'Weapon Law Violations': 'weapons_offense_rate',
  } as Record<string, string>,
};

interface CrimeIncident {
  city: string;
  state: string;
  incident_date: string | null;
  offense_type: string;
  normalized_type: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  case_number: string | null;
  source: string;
  raw_data: Record<string, any>;
}

async function fetchWithDateFilter(
  startDate: string,
  endDate: string,
  offset: number = 0
): Promise<{ features: any[]; exceededLimit: boolean }> {
  const url = `${GRAND_RAPIDS_CONFIG.serviceUrl}/${GRAND_RAPIDS_CONFIG.layerId}/query`;
  
  // Use simple string comparison for dates (works with ArcGIS string date fields)
  const whereClause = `${GRAND_RAPIDS_CONFIG.dateField} >= '${startDate}'`;
  
  const params = new URLSearchParams({
    where: whereClause,
    outFields: '*',
    returnGeometry: 'true',
    f: 'json',
    resultOffset: offset.toString(),
    resultRecordCount: PAGE_SIZE.toString(),
    orderByFields: `${GRAND_RAPIDS_CONFIG.dateField} DESC`,
  });
  
  try {
    const response = await fetch(`${url}?${params}`, { 
      signal: AbortSignal.timeout(60000) 
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP error ${response.status}: ${text.substring(0, 100)}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`ArcGIS error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    
    return {
      features: data.features || [],
      exceededLimit: data.exceededTransferLimit === true,
    };
  } catch (err: any) {
    if (err.name === 'TimeoutError') {
      throw new Error('Request timeout - ArcGIS server slow');
    }
    throw err;
  }
}

function parseFeature(feature: any): CrimeIncident | null {
  const attrs = feature.attributes || {};
  const geom = feature.geometry;
  
  const dateValue = attrs[GRAND_RAPIDS_CONFIG.dateField];
  let incidentDate: string | null = null;
  
  if (dateValue) {
    if (typeof dateValue === 'number') {
      incidentDate = new Date(dateValue).toISOString();
    } else if (typeof dateValue === 'string') {
      const parsed = new Date(dateValue);
      if (!isNaN(parsed.getTime())) {
        incidentDate = parsed.toISOString();
      }
    }
  }
  
  const offenseType = attrs[GRAND_RAPIDS_CONFIG.offenseField] || '';
  const normalizedType = GRAND_RAPIDS_CONFIG.offenseMapping[offenseType] || null;
  
  return {
    city: GRAND_RAPIDS_CONFIG.name,
    state: GRAND_RAPIDS_CONFIG.state,
    incident_date: incidentDate,
    offense_type: offenseType,
    normalized_type: normalizedType,
    latitude: geom?.y || null,
    longitude: geom?.x || null,
    address: attrs.USER_LOCATION || attrs.ADDRESS || null,
    case_number: attrs[GRAND_RAPIDS_CONFIG.caseField] || null,
    source: 'arcgis_grand_rapids',
    raw_data: attrs,
  };
}

async function upsertBatch(incidents: CrimeIncident[]): Promise<number> {
  const rows = incidents.map(inc => ({
    city: inc.city,
    state: inc.state,
    incident_date: inc.incident_date,
    offense_type: inc.offense_type,
    normalized_type: inc.normalized_type,
    address: inc.address,
    case_number: inc.case_number,
    source: inc.source,
    raw_data: inc.raw_data,
    location: inc.latitude && inc.longitude 
      ? `POINT(${inc.longitude} ${inc.latitude})`
      : null,
  }));

  // Use insert with conflict handling on the DB side
  // The partial unique constraint only applies when case_number IS NOT NULL
  const { error } = await supabase
    .from('crime_incidents')
    .insert(rows);
  
  if (error) {
    // If duplicate key error, try inserting one by one
    if (error.message.includes('duplicate')) {
      let inserted = 0;
      for (const row of rows) {
        const { error: singleError } = await supabase
          .from('crime_incidents')
          .insert([row]);
        if (!singleError) inserted++;
      }
      return inserted;
    }
    console.error('Insert error:', error.message);
    return 0;
  }
  
  return incidents.length;
}

async function ingestRecent(): Promise<number> {
  const startDate = '2022-01-01';
  
  console.log(`\n  Fetching data from ${startDate} onward...`);
  
  let offset = 0;
  let hasMore = true;
  let totalFetched = 0;
  let totalInserted = 0;
  let batch: CrimeIncident[] = [];
  let retries = 0;
  const maxRetries = 3;
  
  while (hasMore) {
    try {
      const { features, exceededLimit } = await fetchWithDateFilter(startDate, '', offset);
      
      retries = 0;
      
      for (const feature of features) {
        const incident = parseFeature(feature);
        if (incident) {
          batch.push(incident);
          
          if (batch.length >= BATCH_SIZE) {
            const inserted = await upsertBatch(batch);
            totalInserted += inserted;
            batch = [];
            process.stdout.write(`\r    ${totalFetched.toLocaleString()} fetched, ${totalInserted.toLocaleString()} inserted...`);
          }
        }
      }
      
      totalFetched += features.length;
      hasMore = exceededLimit && features.length > 0;
      offset += features.length;
      
      await new Promise(r => setTimeout(r, 100));
      
    } catch (err: any) {
      console.error(`\n    Error at offset ${offset}:`, err.message);
      retries++;
      if (retries >= maxRetries) {
        console.error('    Max retries reached, stopping.');
        break;
      }
      await new Promise(r => setTimeout(r, 3000 * retries));
    }
  }
  
  if (batch.length > 0) {
    const inserted = await upsertBatch(batch);
    totalInserted += inserted;
  }
  
  console.log(`\n    Total: ${totalFetched.toLocaleString()} fetched, ${totalInserted.toLocaleString()} inserted`);
  return totalInserted;
}

async function main() {
  console.log('============================================================');
  console.log('Grand Rapids Recent Crime Data Ingestion');
  console.log('============================================================');
  console.log('Focus: 2022-2025 (most important years for rolling windows)');
  console.log('Expected: ~108,000+ records');
  
  const totalInserted = await ingestRecent();
  
  console.log('\n============================================================');
  console.log('Summary');
  console.log('============================================================');
  console.log(`Total records inserted: ${totalInserted.toLocaleString()}`);
  console.log('\nNext step: Run rolling window refresh for Michigan:');
  console.log('  npx tsx scripts/refresh-crime-rolling-windows.ts --state MI');
}

main().catch(console.error);
