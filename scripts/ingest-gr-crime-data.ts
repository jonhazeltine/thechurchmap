#!/usr/bin/env npx tsx
/**
 * Grand Rapids Crime Data Ingestion Script
 * 
 * This script:
 * 1. Fetches crime data from Grand Rapids Open Data API
 * 2. Fetches census tract boundaries from TIGERweb
 * 3. Fetches tract population data from Census ACS
 * 4. Aggregates crime points to tracts by specific NIBRS offense groups
 * 5. Calculates crime rates per 1,000 population for 10 crime types
 * 6. Stores results in health_metric_data table
 * 
 * Usage: npx tsx scripts/ingest-gr-crime-data.ts
 */

import { createClient } from '@supabase/supabase-js';

const GR_CRIME_API = 'https://services2.arcgis.com/L81TiOwAPO1ZvU9b/arcgis/rest/services/CRIME_DALLLLLLL/FeatureServer/0';
// Layer 0 = Census Tracts (Layer 8 is Block Groups)
const TIGERWEB_TRACTS_URL = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/0/query';
const CENSUS_ACS_BASE = 'https://api.census.gov/data/2022/acs/acs5';

const KENT_COUNTY_FIPS = '26081';
const MICHIGAN_FIPS = '26';

// 10 specific crime type metrics mapped to NIBRS groups
const CRIME_TYPE_METRICS = {
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
} as const;

type CrimeTypeKey = keyof typeof CRIME_TYPE_METRICS;
type MetricKey = typeof CRIME_TYPE_METRICS[CrimeTypeKey];

interface CrimePoint {
  id: string;
  x: number;
  y: number;
  nibrsGroup: string;
  date: Date;
}

interface TractData {
  tractFips: string;
  geometry: any;
  population: number;
  name: string;
}

interface TractCrimeStats {
  tractFips: string;
  tractName: string;
  population: number;
  crimeCounts: Record<MetricKey, number>;
  crimeRates: Record<MetricKey, number | null>;
}

function mapNIBRSGroupToMetric(nibrsGroup: string): MetricKey | null {
  const normalized = nibrsGroup?.trim();
  if (!normalized) return null;
  
  for (const [group, metric] of Object.entries(CRIME_TYPE_METRICS)) {
    if (normalized === group) {
      return metric as MetricKey;
    }
  }
  return null;
}

async function fetchCrimeData(): Promise<CrimePoint[]> {
  const allCrimes: CrimePoint[] = [];
  let offset = 0;
  const batchSize = 2000;
  let hasMore = true;
  
  const whereClause = '1=1';
  
  console.log(`Fetching all crime data from Grand Rapids Open Data API...`);
  
  while (hasMore) {
    const params = new URLSearchParams({
      where: whereClause,
      outFields: 'USER_INCNUMBER,USER_NIBRS_GRP,USER_DATEOFOFFENSE,X,Y',
      f: 'json',
      resultOffset: String(offset),
      resultRecordCount: String(batchSize),
    });
    
    const url = `${GR_CRIME_API}/query?${params.toString()}`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.features || data.features.length === 0) {
        hasMore = false;
        continue;
      }
      
      const crimes = data.features
        .filter((f: any) => f.attributes && f.attributes.X && f.attributes.Y)
        .map((f: any) => ({
          id: f.attributes.USER_INCNUMBER,
          x: f.attributes.X,
          y: f.attributes.Y,
          nibrsGroup: f.attributes.USER_NIBRS_GRP || '',
          date: new Date(f.attributes.USER_DATEOFOFFENSE),
        }));
      
      allCrimes.push(...crimes);
      console.log(`  Fetched ${allCrimes.length} crimes so far...`);
      
      if (data.features.length < batchSize) {
        hasMore = false;
      } else {
        offset += batchSize;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(`Error fetching crimes at offset ${offset}:`, error);
      hasMore = false;
    }
  }
  
  console.log(`Total crimes fetched: ${allCrimes.length}`);
  return allCrimes;
}

async function fetchTractBoundaries(): Promise<Map<string, { geometry: any; name: string }>> {
  const tracts = new Map<string, { geometry: any; name: string }>();
  
  console.log('Fetching census tract boundaries for Kent County, MI...');
  
  const params = new URLSearchParams({
    where: `STATE='${MICHIGAN_FIPS}' AND COUNTY='081'`,
    outFields: 'GEOID,NAME,STATE,COUNTY,TRACT',
    returnGeometry: 'true',
    f: 'geojson',
    resultRecordCount: '1000',
  });
  
  const url = `${TIGERWEB_TRACTS_URL}?${params.toString()}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TIGERweb error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.features && Array.isArray(data.features)) {
      for (const feature of data.features) {
        const tractFips = feature.properties.GEOID;
        const name = feature.properties.NAME || `Tract ${tractFips}`;
        tracts.set(tractFips, { 
          geometry: feature.geometry,
          name 
        });
      }
    }
    
    console.log(`Fetched ${tracts.size} census tracts`);
  } catch (error) {
    console.error('Error fetching tract boundaries:', error);
  }
  
  return tracts;
}

async function fetchTractPopulations(tractFips: string[]): Promise<Map<string, number>> {
  const populations = new Map<string, number>();
  
  console.log('Fetching tract populations from Census ACS...');
  
  const countyCode = '081';
  
  try {
    const params = new URLSearchParams({
      get: 'B01003_001E,NAME',
      for: 'tract:*',
      in: `state:${MICHIGAN_FIPS} county:${countyCode}`,
    });
    
    const url = `${CENSUS_ACS_BASE}?${params.toString()}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Census ACS error: ${response.status}`);
    }
    
    const data = await response.json();
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const population = parseInt(row[0]) || 0;
      const state = row[2];
      const county = row[3];
      const tract = row[4];
      const fullFips = `${state}${county}${tract}`;
      
      if (tractFips.includes(fullFips)) {
        populations.set(fullFips, population);
      }
    }
    
    console.log(`Fetched populations for ${populations.size} tracts`);
  } catch (error) {
    console.error('Error fetching populations:', error);
  }
  
  return populations;
}

function pointInPolygon(point: [number, number], geometry: any): boolean {
  if (!geometry) return false;
  
  const [x, y] = point;
  
  const polygons = geometry.type === 'MultiPolygon' 
    ? geometry.coordinates 
    : [geometry.coordinates];
  
  for (const polygon of polygons) {
    const ring = polygon[0];
    if (!ring || ring.length < 3) continue;
    
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    
    if (inside) return true;
  }
  
  return false;
}

function initializeCrimeCounts(): Record<MetricKey, number> {
  return {
    assault_rate: 0,
    sex_offense_rate: 0,
    robbery_rate: 0,
    theft_rate: 0,
    burglary_rate: 0,
    vehicle_theft_rate: 0,
    vandalism_rate: 0,
    fraud_rate: 0,
    drug_offense_rate: 0,
    weapons_offense_rate: 0,
  };
}

function initializeCrimeRates(): Record<MetricKey, number | null> {
  return {
    assault_rate: null,
    sex_offense_rate: null,
    robbery_rate: null,
    theft_rate: null,
    burglary_rate: null,
    vehicle_theft_rate: null,
    vandalism_rate: null,
    fraud_rate: null,
    drug_offense_rate: null,
    weapons_offense_rate: null,
  };
}

function aggregateCrimesToTracts(
  crimes: CrimePoint[],
  tracts: Map<string, { geometry: any; name: string }>,
  populations: Map<string, number>
): TractCrimeStats[] {
  console.log('Aggregating crimes to census tracts by type...');
  
  const tractStats = new Map<string, TractCrimeStats>();
  
  for (const [tractFips, { name }] of tracts) {
    tractStats.set(tractFips, {
      tractFips,
      tractName: name,
      population: populations.get(tractFips) || 0,
      crimeCounts: initializeCrimeCounts(),
      crimeRates: initializeCrimeRates(),
    });
  }
  
  let assignedCrimes = 0;
  let processedCrimes = 0;
  const crimeTypeCounts: Record<string, number> = {};
  
  for (const crime of crimes) {
    processedCrimes++;
    if (processedCrimes % 10000 === 0) {
      console.log(`  Processed ${processedCrimes}/${crimes.length} crimes...`);
    }
    
    const metricKey = mapNIBRSGroupToMetric(crime.nibrsGroup);
    if (!metricKey) continue;
    
    crimeTypeCounts[metricKey] = (crimeTypeCounts[metricKey] || 0) + 1;
    
    for (const [tractFips, { geometry }] of tracts) {
      if (pointInPolygon([crime.x, crime.y], geometry)) {
        const stats = tractStats.get(tractFips)!;
        stats.crimeCounts[metricKey]++;
        assignedCrimes++;
        break;
      }
    }
  }
  
  console.log(`\nCrime type distribution:`);
  for (const [type, count] of Object.entries(crimeTypeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
  
  console.log(`\nAssigned ${assignedCrimes} crimes to ${tracts.size} tracts`);
  
  const MIN_POPULATION = 100;
  
  for (const stats of tractStats.values()) {
    if (stats.population >= MIN_POPULATION) {
      for (const metricKey of Object.keys(stats.crimeCounts) as MetricKey[]) {
        const count = stats.crimeCounts[metricKey];
        stats.crimeRates[metricKey] = Math.round((count / stats.population) * 100000 * 100) / 100;
      }
    }
  }
  
  return Array.from(tractStats.values());
}

async function storeInDatabase(
  supabase: ReturnType<typeof createClient>,
  stats: TractCrimeStats[],
  dataPeriod: string
): Promise<void> {
  console.log('Storing crime data in database...');
  
  const metricKeys = Object.values(CRIME_TYPE_METRICS);
  
  const { data: metrics, error: metricsError } = await supabase
    .from('health_metrics')
    .select('id, metric_key')
    .in('metric_key', metricKeys);
  
  if (metricsError) {
    throw new Error(`Failed to fetch metrics: ${metricsError.message}`);
  }
  
  const metricIdMap = new Map<string, string>();
  for (const m of metrics || []) {
    metricIdMap.set(m.metric_key, m.id);
  }
  
  if (metricIdMap.size === 0) {
    console.error('No crime metrics found in database. Run migration 0063 first.');
    return;
  }
  
  console.log(`Found ${metricIdMap.size} crime metrics in database`);
  
  const rows: any[] = [];
  
  for (const stat of stats) {
    for (const metricKey of metricKeys) {
      const rate = stat.crimeRates[metricKey as MetricKey];
      const count = stat.crimeCounts[metricKey as MetricKey];
      const metricId = metricIdMap.get(metricKey);
      
      if (rate !== null && metricId) {
        rows.push({
          metric_id: metricId,
          geo_fips: stat.tractFips,
          geo_level: 'tract',
          geo_name: stat.tractName,
          state_fips: MICHIGAN_FIPS,
          state_abbr: 'MI',
          estimate: rate,
          numerator: count,
          denominator: stat.population,
          data_period: dataPeriod,
          period_type: 'multi-year',
          source_name: 'Grand Rapids Police Department',
          group_name: 'Total',
        });
      }
    }
  }
  
  console.log(`Upserting ${rows.length} crime metric records...`);
  
  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    
    const { error } = await supabase
      .from('health_metric_data')
      .upsert(batch, { 
        onConflict: 'metric_id,geo_fips,data_period,group_name',
        ignoreDuplicates: false 
      });
    
    if (error) {
      console.error(`Error upserting batch at ${i}:`, error.message);
    } else {
      console.log(`  Upserted ${Math.min(i + batchSize, rows.length)}/${rows.length} records`);
    }
  }
  
  console.log('Crime data stored successfully!');
}

async function main() {
  console.log('='.repeat(60));
  console.log('Grand Rapids Crime Data Ingestion (10 Specific Crime Types)');
  console.log('='.repeat(60));
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const dataPeriod = '2022-2025';
  
  console.log(`\nFetching all available crime data...\n`);
  
  const crimes = await fetchCrimeData();
  
  if (crimes.length === 0) {
    console.error('No crime data fetched. Exiting.');
    process.exit(1);
  }
  
  const tracts = await fetchTractBoundaries();
  
  if (tracts.size === 0) {
    console.error('No tract boundaries fetched. Exiting.');
    process.exit(1);
  }
  
  const populations = await fetchTractPopulations(Array.from(tracts.keys()));
  
  const stats = aggregateCrimesToTracts(crimes, tracts, populations);
  
  console.log('\nSample tract statistics:');
  const sampleStats = stats.slice(0, 3);
  for (const s of sampleStats) {
    console.log(`  ${s.tractFips} (pop=${s.population}):`);
    for (const [key, count] of Object.entries(s.crimeCounts)) {
      if (count > 0) {
        const rate = s.crimeRates[key as MetricKey];
        console.log(`    ${key}: ${count} crimes, rate=${rate?.toFixed(2) || 'N/A'} per 1000`);
      }
    }
  }
  
  await storeInDatabase(supabase, stats, dataPeriod);
  
  console.log('\n' + '='.repeat(60));
  console.log('Ingestion complete!');
  console.log('='.repeat(60));
}

main().catch(console.error);
