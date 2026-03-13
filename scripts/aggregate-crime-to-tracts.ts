#!/usr/bin/env npx tsx
/**
 * Crime Data Tract Aggregation Script
 * 
 * Aggregates crime_incidents to census tracts and calculates rates per 1,000 population.
 * Uses PostGIS spatial join in Supabase to match incidents to tract boundaries.
 * 
 * Usage:
 *   npx tsx scripts/aggregate-crime-to-tracts.ts --city "Grand Rapids"
 *   npx tsx scripts/aggregate-crime-to-tracts.ts --city "Grand Rapids" --dry-run
 *   npx tsx scripts/aggregate-crime-to-tracts.ts --state MI
 *   npx tsx scripts/aggregate-crime-to-tracts.ts --state TX --year 2024
 * 
 * Prerequisites:
 * - Crime incidents imported via ingest-socrata-crime.ts or ingest-arcgis-crime-unified.ts
 * - Census tract boundaries in boundaries table
 * - Tract populations in health_metric_data (via CDC PLACES or Census ACS scripts)
 * 
 * Output:
 * - Stores crime rates in health_metric_data table using existing crime metric IDs
 */

import { createClient } from '@supabase/supabase-js';
import * as wkx from 'wkx';
import { CRIME_METRIC_KEYS, CrimeMetricKey } from './config/crime-sources';

const BATCH_SIZE = 100;
const MIN_POPULATION = 100;

interface TractCrimeStats {
  tractFips: string;
  tractName: string;
  population: number;
  crimeCounts: Record<CrimeMetricKey, number>;
  crimeRates: Record<CrimeMetricKey, number | null>;
}

async function getMetricIds(
  supabase: ReturnType<typeof createClient>
): Promise<Map<string, string>> {
  const metricKeyToId = new Map<string, string>();
  
  const rateKeys = CRIME_METRIC_KEYS;
  
  const { data: metrics, error } = await supabase
    .from('health_metrics')
    .select('id, metric_key')
    .in('metric_key', rateKeys);
  
  if (error) {
    throw new Error(`Failed to fetch crime metrics: ${error.message}`);
  }
  
  for (const m of metrics || []) {
    metricKeyToId.set(m.metric_key, m.id);
  }
  
  console.log(`Found ${metricKeyToId.size}/${rateKeys.length} crime metrics in database`);
  
  if (metricKeyToId.size === 0) {
    console.error('No crime metrics found. Ensure health_metrics table has crime rate entries.');
    console.log('Expected metric keys:', rateKeys);
  }
  
  return metricKeyToId;
}

function parseLocation(location: any): { lat: number; lon: number } | null {
  if (!location) return null;
  
  // Handle GeoJSON format
  if (typeof location === 'object' && location.type === 'Point' && Array.isArray(location.coordinates)) {
    const [lon, lat] = location.coordinates;
    if (typeof lon === 'number' && typeof lat === 'number') {
      return { lat, lon };
    }
  }
  
  if (typeof location === 'string') {
    // Handle WKT format
    const wktMatch = location.match(/POINT\s*\(\s*([^\s]+)\s+([^\s)]+)\s*\)/i);
    if (wktMatch) {
      return {
        lon: parseFloat(wktMatch[1]),
        lat: parseFloat(wktMatch[2]),
      };
    }
    
    // Handle EWKB hex format (starts with 0101000020E6...)
    if (/^[0-9a-fA-F]+$/.test(location) && location.length > 20) {
      try {
        const buffer = Buffer.from(location, 'hex');
        const geometry = wkx.Geometry.parse(buffer);
        const geoJson = geometry.toGeoJSON() as { type: string; coordinates: number[] };
        if (geoJson.type === 'Point' && Array.isArray(geoJson.coordinates)) {
          const [lon, lat] = geoJson.coordinates;
          return { lat, lon };
        }
      } catch (e) {
        // Failed to parse EWKB
      }
    }
  }
  
  return null;
}

async function getCityIncidents(
  supabase: ReturnType<typeof createClient>,
  city: string,
  state: string,
  year?: number
): Promise<{ normalized_type: string; lat: number; lon: number }[]> {
  let query = supabase
    .from('crime_incidents')
    .select('normalized_type, location')
    .eq('city', city)
    .eq('state', state)
    .not('normalized_type', 'is', null)
    .not('location', 'is', null);
  
  if (year) {
    query = query
      .gte('incident_date', `${year}-01-01`)
      .lt('incident_date', `${year + 1}-01-01`);
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Failed to fetch incidents: ${error.message}`);
  }
  
  const incidents: { normalized_type: string; lat: number; lon: number }[] = [];
  
  for (const record of data || []) {
    if (record.location && record.normalized_type) {
      const coords = parseLocation(record.location);
      if (coords) {
        incidents.push({
          normalized_type: record.normalized_type,
          lat: coords.lat,
          lon: coords.lon,
        });
      }
    }
  }
  
  return incidents;
}

async function getStateIncidents(
  supabase: ReturnType<typeof createClient>,
  state: string,
  year?: number
): Promise<{ city: string; normalized_type: string; lat: number; lon: number }[]> {
  let query = supabase
    .from('crime_incidents')
    .select('city, normalized_type, location')
    .eq('state', state)
    .not('normalized_type', 'is', null)
    .not('location', 'is', null);
  
  if (year) {
    query = query
      .gte('incident_date', `${year}-01-01`)
      .lt('incident_date', `${year + 1}-01-01`);
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Failed to fetch state incidents: ${error.message}`);
  }
  
  const incidents: { city: string; normalized_type: string; lat: number; lon: number }[] = [];
  
  for (const record of data || []) {
    if (record.location && record.normalized_type && record.city) {
      const coords = parseLocation(record.location);
      if (coords) {
        incidents.push({
          city: record.city,
          normalized_type: record.normalized_type,
          lat: coords.lat,
          lon: coords.lon,
        });
      }
    }
  }
  
  return incidents;
}

async function getTractBoundaries(
  supabase: ReturnType<typeof createClient>,
  stateFips: string,
  countyFips?: string
): Promise<Map<string, { name: string; geometry: any }>> {
  let query = supabase
    .from('boundaries')
    .select('external_id, name, geometry')
    .eq('type', 'census_tract')
    .eq('state_fips', stateFips);
  
  if (countyFips) {
    query = query.like('external_id', `${countyFips}%`);
  }
  
  const { data, error } = await query;
  
  if (error) {
    throw new Error(`Failed to fetch tract boundaries: ${error.message}`);
  }
  
  const tracts = new Map<string, { name: string; geometry: any }>();
  
  for (const row of data || []) {
    if (row.external_id && row.geometry) {
      tracts.set(row.external_id, {
        name: row.name || `Tract ${row.external_id}`,
        geometry: row.geometry,
      });
    }
  }
  
  console.log(`Loaded ${tracts.size} census tracts for state ${stateFips}`);
  return tracts;
}

async function getTractPopulations(
  supabase: ReturnType<typeof createClient>,
  stateFips: string
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('health_metric_data')
    .select('geo_fips, denominator')
    .eq('state_fips', stateFips)
    .eq('geo_level', 'tract')
    .not('denominator', 'is', null);
  
  const populations = new Map<string, number>();
  
  if (error) {
    console.warn(`Warning: Could not fetch tract populations: ${error.message}`);
    return populations;
  }
  
  for (const row of data || []) {
    if (row.geo_fips && row.denominator > 0) {
      populations.set(row.geo_fips, row.denominator);
    }
  }
  
  console.log(`Loaded populations for ${populations.size} tracts`);
  return populations;
}

function pointInPolygon(point: [number, number], geometry: any): boolean {
  if (!geometry) return false;
  
  const [x, y] = point;
  
  let polygons: number[][][][] = [];
  
  if (geometry.type === 'MultiPolygon') {
    polygons = geometry.coordinates;
  } else if (geometry.type === 'Polygon') {
    polygons = [geometry.coordinates];
  } else {
    return false;
  }
  
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

function initializeCrimeCounts(): Record<CrimeMetricKey, number> {
  const counts: Record<string, number> = {};
  for (const key of CRIME_METRIC_KEYS) {
    counts[key] = 0;
  }
  return counts as Record<CrimeMetricKey, number>;
}

function initializeCrimeRates(): Record<CrimeMetricKey, number | null> {
  const rates: Record<string, number | null> = {};
  for (const key of CRIME_METRIC_KEYS) {
    rates[key] = null;
  }
  return rates as Record<CrimeMetricKey, number | null>;
}

function aggregateIncidentsToTracts(
  incidents: { normalized_type: string; lat: number; lon: number }[],
  tracts: Map<string, { name: string; geometry: any }>,
  populations: Map<string, number>
): TractCrimeStats[] {
  console.log('Aggregating incidents to census tracts...');
  
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
  
  let assignedIncidents = 0;
  let processedIncidents = 0;
  
  for (const incident of incidents) {
    processedIncidents++;
    if (processedIncidents % 10000 === 0) {
      console.log(`  Processed ${processedIncidents}/${incidents.length} incidents...`);
    }
    
    const metricKey = incident.normalized_type as CrimeMetricKey;
    
    for (const [tractFips, { geometry }] of tracts) {
      if (pointInPolygon([incident.lon, incident.lat], geometry)) {
        const stats = tractStats.get(tractFips)!;
        stats.crimeCounts[metricKey]++;
        assignedIncidents++;
        break;
      }
    }
  }
  
  console.log(`Assigned ${assignedIncidents}/${incidents.length} incidents to tracts`);
  
  for (const stats of tractStats.values()) {
    if (stats.population >= MIN_POPULATION) {
      for (const metricKey of CRIME_METRIC_KEYS) {
        const count = stats.crimeCounts[metricKey];
        stats.crimeRates[metricKey] = Math.round((count / stats.population) * 100000 * 100) / 100;
      }
    }
  }
  
  return Array.from(tractStats.values());
}

async function storeRates(
  supabase: ReturnType<typeof createClient>,
  stats: TractCrimeStats[],
  metricIdMap: Map<string, string>,
  stateFips: string,
  stateAbbr: string,
  sourceName: string,
  dataPeriod: string,
  dryRun: boolean
): Promise<{ inserted: number; errors: number }> {
  if (dryRun) {
    const totalRecords = stats.length * CRIME_METRIC_KEYS.length;
    console.log(`[DRY RUN] Would upsert up to ${totalRecords} crime rate records`);
    return { inserted: totalRecords, errors: 0 };
  }
  
  const rows: any[] = [];
  
  for (const stat of stats) {
    for (const metricKey of CRIME_METRIC_KEYS) {
      const rate = stat.crimeRates[metricKey];
      const count = stat.crimeCounts[metricKey];
      const metricId = metricIdMap.get(metricKey);
      
      if (rate !== null && metricId) {
        rows.push({
          metric_id: metricId,
          geo_fips: stat.tractFips,
          geo_level: 'tract',
          geo_name: stat.tractName,
          state_fips: stateFips,
          state_abbr: stateAbbr,
          estimate: rate,
          numerator: count,
          denominator: stat.population,
          data_period: dataPeriod,
          period_type: 'multi-year',
          source_name: sourceName,
          group_name: 'Total',
        });
      }
    }
  }
  
  console.log(`Upserting ${rows.length} crime rate records...`);
  
  let inserted = 0;
  let errors = 0;
  
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    
    const { error } = await supabase
      .from('health_metric_data')
      .upsert(batch, {
        onConflict: 'metric_id,geo_fips,data_period,group_name',
        ignoreDuplicates: false,
      });
    
    if (error) {
      console.error(`  Error upserting batch at ${i}: ${error.message}`);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
    
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= rows.length) {
      console.log(`  Upserted ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} records`);
    }
  }
  
  return { inserted, errors };
}

async function main() {
  const args = process.argv.slice(2);
  
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
  
  const hasCity = cityIndex !== -1 && args[cityIndex + 1];
  const hasState = stateIndex !== -1 && args[stateIndex + 1];
  const year = yearIndex !== -1 ? parseInt(args[yearIndex + 1]) : undefined;
  
  if (!hasCity && !hasState) {
    console.log('Usage:');
    console.log('  npx tsx scripts/aggregate-crime-to-tracts.ts --city "Grand Rapids" [--year 2024] [--dry-run]');
    console.log('  npx tsx scripts/aggregate-crime-to-tracts.ts --state MI [--year 2024] [--dry-run]');
    console.log('\nOptions:');
    console.log('  --city    City name to aggregate');
    console.log('  --state   State abbreviation (MI or TX) to aggregate all cities');
    console.log('  --year    Filter incidents to specific year');
    console.log('  --dry-run Test without writing to database');
    process.exit(1);
  }
  
  console.log('='.repeat(60));
  console.log('Crime Data Tract Aggregation');
  console.log('='.repeat(60));
  
  const metricIdMap = await getMetricIds(supabase);
  if (metricIdMap.size === 0) {
    console.error('Cannot proceed without crime metrics. Exiting.');
    process.exit(1);
  }
  
  const STATE_FIPS: Record<string, { fips: string; abbr: string }> = {
    MI: { fips: '26', abbr: 'MI' },
    TX: { fips: '48', abbr: 'TX' },
  };
  
  if (hasCity) {
    const cityName = args[cityIndex + 1];
    
    const { data: cityData } = await supabase
      .from('crime_incidents')
      .select('state')
      .eq('city', cityName)
      .limit(1);
    
    if (!cityData || cityData.length === 0) {
      console.error(`No incidents found for city: ${cityName}`);
      process.exit(1);
    }
    
    const stateAbbr = cityData[0].state;
    const stateInfo = STATE_FIPS[stateAbbr];
    
    if (!stateInfo) {
      console.error(`Unknown state: ${stateAbbr}`);
      process.exit(1);
    }
    
    console.log(`City: ${cityName}, ${stateAbbr}`);
    if (year) console.log(`Year: ${year}`);
    if (dryRun) console.log('Mode: DRY RUN');
    
    const incidents = await getCityIncidents(supabase, cityName, stateAbbr, year);
    console.log(`Found ${incidents.length} geolocated incidents with normalized types`);
    
    if (incidents.length === 0) {
      console.log('No incidents to aggregate.');
      return;
    }
    
    const tracts = await getTractBoundaries(supabase, stateInfo.fips);
    const populations = await getTractPopulations(supabase, stateInfo.fips);
    
    const stats = aggregateIncidentsToTracts(incidents, tracts, populations);
    
    console.log('\nSample tract stats:');
    stats.slice(0, 3).forEach(s => {
      const nonZero = Object.entries(s.crimeCounts).filter(([_, c]) => c > 0);
      console.log(`  ${s.tractFips} (pop=${s.population}): ${nonZero.length} crime types`);
    });
    
    const dataPeriod = year ? String(year) : '2022-2024';
    const sourceName = `${cityName} Police Department`;
    
    const { inserted, errors } = await storeRates(
      supabase,
      stats,
      metricIdMap,
      stateInfo.fips,
      stateInfo.abbr,
      sourceName,
      dataPeriod,
      dryRun
    );
    
    console.log(`\nComplete! Inserted: ${inserted}, Errors: ${errors}`);
    
  } else if (hasState) {
    const stateAbbr = args[stateIndex + 1].toUpperCase();
    const stateInfo = STATE_FIPS[stateAbbr];
    
    if (!stateInfo) {
      console.error(`Unknown state: ${stateAbbr}. Available: MI, TX`);
      process.exit(1);
    }
    
    console.log(`State: ${stateAbbr}`);
    if (year) console.log(`Year: ${year}`);
    if (dryRun) console.log('Mode: DRY RUN');
    
    const incidents = await getStateIncidents(supabase, stateAbbr, year);
    console.log(`Found ${incidents.length} geolocated incidents with normalized types`);
    
    if (incidents.length === 0) {
      console.log('No incidents to aggregate.');
      return;
    }
    
    const tracts = await getTractBoundaries(supabase, stateInfo.fips);
    const populations = await getTractPopulations(supabase, stateInfo.fips);
    
    const incidentsByCity: Record<string, typeof incidents> = {};
    for (const inc of incidents) {
      if (!incidentsByCity[inc.city]) {
        incidentsByCity[inc.city] = [];
      }
      incidentsByCity[inc.city].push(inc);
    }
    
    console.log(`Cities with incidents: ${Object.keys(incidentsByCity).join(', ')}`);
    
    const allIncidents = incidents.map(i => ({
      normalized_type: i.normalized_type,
      lat: i.lat,
      lon: i.lon,
    }));
    
    const stats = aggregateIncidentsToTracts(allIncidents, tracts, populations);
    
    const dataPeriod = year ? String(year) : '2022-2024';
    const sourceName = `${stateAbbr} Combined Crime Data`;
    
    const { inserted, errors } = await storeRates(
      supabase,
      stats,
      metricIdMap,
      stateInfo.fips,
      stateInfo.abbr,
      sourceName,
      dataPeriod,
      dryRun
    );
    
    console.log(`\nComplete! Inserted: ${inserted}, Errors: ${errors}`);
  }
}

main().catch(console.error);
