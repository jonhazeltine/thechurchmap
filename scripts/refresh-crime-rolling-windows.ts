#!/usr/bin/env npx tsx
/**
 * Crime Rolling Window Refresh Script
 * 
 * Aggregates crime_incidents to census tracts for consistent time windows:
 * - 12-month rolling window (for heatmaps - recent crime patterns)
 * - 36-month rolling window (for trends - longer-term patterns)
 * 
 * This script should be run nightly to keep the rolling windows current.
 * It replaces any existing rolling window data with fresh calculations.
 * 
 * Usage:
 *   npx tsx scripts/refresh-crime-rolling-windows.ts
 *   npx tsx scripts/refresh-crime-rolling-windows.ts --dry-run
 *   npx tsx scripts/refresh-crime-rolling-windows.ts --state MI
 *   npx tsx scripts/refresh-crime-rolling-windows.ts --12mo-only
 *   npx tsx scripts/refresh-crime-rolling-windows.ts --36mo-only
 * 
 * Output:
 * - Stores crime rates in health_metric_data with data_period = "12mo_rolling" or "36mo_rolling"
 */

import { createClient } from '@supabase/supabase-js';
import * as wkx from 'wkx';
import { CRIME_METRIC_KEYS, CrimeMetricKey, SOCRATA_ENDPOINTS, ARCGIS_ENDPOINTS, CKAN_ENDPOINTS, CARTO_ENDPOINTS } from './config/crime-sources';

// TIGERweb API for census tract boundaries
const TIGERWEB_TRACTS_URL = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/0/query';

interface TractFeature {
  type: 'Feature';
  properties: {
    GEOID: string;
    NAME: string;
    STATE: string;
    COUNTY: string;
    TRACT: string;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][];
  };
}

const BATCH_SIZE = 100;
const MIN_POPULATION = 100;

interface TractCrimeStats {
  tractFips: string;
  tractName: string;
  population: number;
  crimeCounts: Record<CrimeMetricKey, number>;
  crimeRates: Record<CrimeMetricKey, number | null>;
}

interface CityInfo {
  city: string;
  state: string;
  stateFips: string;
  incidentCount: number;
}

async function getMetricIds(
  supabase: ReturnType<typeof createClient<any>>
): Promise<Map<string, string>> {
  const metricKeyToId = new Map<string, string>();
  
  const { data: metrics, error } = await supabase
    .from('health_metrics')
    .select('id, metric_key')
    .in('metric_key', CRIME_METRIC_KEYS as unknown as string[]);
  
  if (error) {
    throw new Error(`Failed to fetch crime metrics: ${error.message}`);
  }
  
  for (const m of (metrics as any[]) || []) {
    metricKeyToId.set(m.metric_key, m.id);
  }
  
  console.log(`Found ${metricKeyToId.size}/${CRIME_METRIC_KEYS.length} crime metrics in database`);
  return metricKeyToId;
}

// Track parse failures for diagnostics
let parseFailures = 0;
let parseSuccesses = 0;

function parseLocation(location: any): { lat: number; lon: number } | null {
  if (!location) return null;
  
  // Handle GeoJSON format (object with type and coordinates)
  if (typeof location === 'object' && location.type === 'Point' && Array.isArray(location.coordinates)) {
    const [lon, lat] = location.coordinates;
    if (typeof lon === 'number' && typeof lat === 'number') {
      parseSuccesses++;
      return { lat, lon };
    }
  }
  
  if (typeof location === 'string') {
    // Handle WKT/EWKT format: POINT(-87.123 41.456) or SRID=4326;POINT(-87.123 41.456)
    const wktMatch = location.match(/POINT\s*\(\s*([^\s]+)\s+([^\s)]+)\s*\)/i);
    if (wktMatch) {
      const lon = parseFloat(wktMatch[1]);
      const lat = parseFloat(wktMatch[2]);
      if (!isNaN(lon) && !isNaN(lat)) {
        parseSuccesses++;
        return { lon, lat };
      }
    }
    
    // Handle EWKB hex format (what Supabase returns for geography columns)
    // Format: starts with 01 (little endian) followed by type bytes
    if (/^[0-9a-fA-F]+$/.test(location) && location.length > 20) {
      try {
        const buffer = Buffer.from(location, 'hex');
        const geometry = wkx.Geometry.parse(buffer);
        const geoJson = geometry.toGeoJSON() as { type: string; coordinates: number[] };
        if (geoJson.type === 'Point' && Array.isArray(geoJson.coordinates)) {
          const [lon, lat] = geoJson.coordinates;
          parseSuccesses++;
          return { lat, lon };
        }
      } catch (e) {
        // Log first few failures for diagnostics
        if (parseFailures < 5) {
          console.warn(`    [DEBUG] EWKB parse failed for: ${location.substring(0, 50)}...`);
        }
        parseFailures++;
      }
    }
  }
  
  parseFailures++;
  return null;
}

function resetParseCounters() {
  parseFailures = 0;
  parseSuccesses = 0;
}

function getParseStats(): { successes: number; failures: number } {
  return { successes: parseSuccesses, failures: parseFailures };
}

function getCitiesFromConfig(stateFilter?: string): CityInfo[] {
  console.log('Loading cities from crime sources config...');
  
  const cityMap = new Map<string, CityInfo>();
  
  // Combine all endpoints from different sources
  const allEndpoints = [
    ...SOCRATA_ENDPOINTS,
    ...ARCGIS_ENDPOINTS,
    ...(CKAN_ENDPOINTS || []),
    ...(CARTO_ENDPOINTS || []),
  ];
  
  for (const endpoint of allEndpoints) {
    if (stateFilter && endpoint.state !== stateFilter) continue;
    
    const key = `${endpoint.name}|${endpoint.state}`;
    if (!cityMap.has(key)) {
      cityMap.set(key, {
        city: endpoint.name,
        state: endpoint.state,
        stateFips: endpoint.stateFips,
        incidentCount: 0, // Will be populated during processing
      });
    }
  }
  
  const cities = Array.from(cityMap.values()).sort((a, b) => a.city.localeCompare(b.city));
  console.log(`Found ${cities.length} cities from config`);
  
  return cities;
}

function getStateFips(stateAbbr: string): string {
  const stateFipsMap: Record<string, string> = {
    'AL': '01', 'AK': '02', 'AZ': '04', 'AR': '05', 'CA': '06',
    'CO': '08', 'CT': '09', 'DE': '10', 'DC': '11', 'FL': '12',
    'GA': '13', 'HI': '15', 'ID': '16', 'IL': '17', 'IN': '18',
    'IA': '19', 'KS': '20', 'KY': '21', 'LA': '22', 'ME': '23',
    'MD': '24', 'MA': '25', 'MI': '26', 'MN': '27', 'MS': '28',
    'MO': '29', 'MT': '30', 'NE': '31', 'NV': '32', 'NH': '33',
    'NJ': '34', 'NM': '35', 'NY': '36', 'NC': '37', 'ND': '38',
    'OH': '39', 'OK': '40', 'OR': '41', 'PA': '42', 'RI': '44',
    'SC': '45', 'SD': '46', 'TN': '47', 'TX': '48', 'UT': '49',
    'VT': '50', 'VA': '51', 'WA': '53', 'WV': '54', 'WI': '55',
    'WY': '56',
  };
  return stateFipsMap[stateAbbr] || '00';
}

async function getIncidentsInWindow(
  supabase: ReturnType<typeof createClient<any>>,
  city: string,
  state: string,
  monthsBack: number
): Promise<{ normalized_type: string; lat: number; lon: number }[]> {
  const incidents: { normalized_type: string; lat: number; lon: number }[] = [];
  const maxIncidents = 500000;
  
  // Reset parse counters for this city
  resetParseCounters();
  
  // Use date-sliced batching to avoid timeouts on large cities
  // Process one month at a time
  const now = new Date();
  const monthChunks: { start: string; end: string }[] = [];
  
  for (let i = 0; i < monthsBack; i++) {
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() - i);
    const startDate = new Date(now);
    startDate.setMonth(startDate.getMonth() - i - 1);
    
    monthChunks.push({
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    });
  }
  
  // First, check total count for this city/state in the rolling window
  const cutoffDate = monthChunks[monthChunks.length - 1]?.start || '';
  const { count: totalCount, error: countError } = await supabase
    .from('crime_incidents')
    .select('*', { count: 'exact', head: true })
    .eq('city', city)
    .eq('state', state)
    .not('normalized_type', 'is', null)
    .not('location', 'is', null)
    .gte('incident_date', cutoffDate);
  
  if (countError) {
    console.log(`    [DEBUG] Count query error: ${countError.message}`);
  } else {
    console.log(`    [DEBUG] Total usable incidents in ${monthsBack}mo window: ${totalCount || 0}`);
  }
  
  // If no data at all, check if any data exists without filters
  if (totalCount === 0) {
    const { count: baseCount } = await supabase
      .from('crime_incidents')
      .select('*', { count: 'exact', head: true })
      .eq('city', city)
      .eq('state', state);
    
    console.log(`    [DEBUG] Total incidents for ${city}, ${state} (any date/type): ${baseCount || 0}`);
    
    if ((baseCount || 0) > 0) {
      // Check normalized_type coverage
      const { count: typedCount } = await supabase
        .from('crime_incidents')
        .select('*', { count: 'exact', head: true })
        .eq('city', city)
        .eq('state', state)
        .not('normalized_type', 'is', null);
      
      // Check location coverage
      const { count: locatedCount } = await supabase
        .from('crime_incidents')
        .select('*', { count: 'exact', head: true })
        .eq('city', city)
        .eq('state', state)
        .not('location', 'is', null);
      
      // Check date range
      const { data: dateRange } = await supabase
        .from('crime_incidents')
        .select('incident_date')
        .eq('city', city)
        .eq('state', state)
        .order('incident_date', { ascending: false })
        .limit(1);
      
      console.log(`    [DEBUG] With normalized_type: ${typedCount || 0}`);
      console.log(`    [DEBUG] With location: ${locatedCount || 0}`);
      console.log(`    [DEBUG] Latest incident date: ${dateRange?.[0]?.incident_date || 'N/A'}`);
      console.log(`    [DEBUG] Date range filter: >= ${cutoffDate}`);
    }
  }
  
  let totalRowsFetched = 0;
  
  for (const chunk of monthChunks) {
    if (incidents.length >= maxIncidents) break;
    
    const pageSize = 5000;
    let offset = 0;
    let hasMore = true;
    let retries = 0;
    const maxRetries = 2;
    
    while (hasMore && incidents.length < maxIncidents) {
      try {
        const { data, error } = await supabase
          .from('crime_incidents')
          .select('normalized_type, location')
          .eq('city', city)
          .eq('state', state)
          .not('normalized_type', 'is', null)
          .not('location', 'is', null)
          .gte('incident_date', chunk.start)
          .lt('incident_date', chunk.end)
          .range(offset, offset + pageSize - 1);
        
        if (error) {
          if (error.message.includes('timeout') && retries < maxRetries) {
            retries++;
            await new Promise(r => setTimeout(r, 1000 * retries));
            continue;
          }
          console.warn(`    [DEBUG] Query error for ${chunk.start} to ${chunk.end}: ${error.message}`);
          break;
        }
        
        retries = 0;
        const rows = (data as any[]) || [];
        totalRowsFetched += rows.length;
        
        for (const record of rows) {
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
        
        hasMore = rows.length === pageSize;
        offset += pageSize;
      } catch (err) {
        if (retries < maxRetries) {
          retries++;
          await new Promise(r => setTimeout(r, 1000 * retries));
        } else {
          console.warn(`    [DEBUG] Exception for ${chunk.start} to ${chunk.end}: ${err}`);
          break;
        }
      }
    }
  }
  
  // Report parse statistics
  const parseStats = getParseStats();
  if (totalRowsFetched > 0) {
    console.log(`    [DEBUG] Rows fetched: ${totalRowsFetched}, Locations parsed: ${parseStats.successes}, Parse failures: ${parseStats.failures}`);
  }
  
  return incidents;
}

async function fetchCountyTractsFromTIGERweb(stateFips: string, countyFips: string): Promise<TractFeature[]> {
  try {
    const params = new URLSearchParams({
      where: `STATE='${stateFips}' AND COUNTY='${countyFips}'`,
      outFields: 'GEOID,NAME,STATE,COUNTY,TRACT',
      returnGeometry: 'true',
      f: 'geojson',
      resultRecordCount: '500'
    });

    const response = await fetch(`${TIGERWEB_TRACTS_URL}?${params}`, {
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.features || [];
  } catch (error) {
    return [];
  }
}

async function getStateCounties(stateFips: string): Promise<string[]> {
  // Get unique counties from TIGERweb Counties layer
  const COUNTIES_URL = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query';
  
  try {
    const params = new URLSearchParams({
      where: `STATE='${stateFips}'`,
      outFields: 'COUNTY',
      returnGeometry: 'false',
      f: 'json',
      returnDistinctValues: 'true',
      resultRecordCount: '500'
    });

    const response = await fetch(`${COUNTIES_URL}?${params}`, {
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) return [];
    
    const data = await response.json();
    const counties: string[] = [];
    
    for (const feature of (data.features || [])) {
      if (feature.attributes?.COUNTY) {
        counties.push(feature.attributes.COUNTY);
      }
    }
    
    return counties.sort();
  } catch (error) {
    return [];
  }
}

async function fetchTractsFromTIGERweb(stateFips: string): Promise<TractFeature[]> {
  const allTracts: TractFeature[] = [];
  
  // Get list of counties
  const counties = await getStateCounties(stateFips);
  
  if (counties.length === 0) {
    console.error(`    No counties found for state ${stateFips}`);
    return [];
  }
  
  // Fetch tracts by county (parallel, in batches of 5)
  const batchSize = 5;
  for (let i = 0; i < counties.length; i += batchSize) {
    const batch = counties.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(county => fetchCountyTractsFromTIGERweb(stateFips, county))
    );
    
    for (const features of results) {
      allTracts.push(...features);
    }
  }
  
  return allTracts;
}

async function getTractBoundaries(
  stateFips: string
): Promise<Map<string, { name: string; geometry: any }>> {
  const tracts = new Map<string, { name: string; geometry: any }>();
  
  console.log(`  Fetching tract boundaries from TIGERweb for state ${stateFips}...`);
  const features = await fetchTractsFromTIGERweb(stateFips);
  
  for (const feature of features) {
    if (feature.geometry && feature.properties?.GEOID) {
      tracts.set(feature.properties.GEOID, {
        name: feature.properties.NAME || `Tract ${feature.properties.GEOID}`,
        geometry: feature.geometry,
      });
    }
  }
  
  console.log(`  Found ${tracts.size} tract boundaries`);
  return tracts;
}

async function getTractPopulations(
  supabase: ReturnType<typeof createClient<any>>,
  stateFips: string
): Promise<Map<string, number>> {
  const populations = new Map<string, number>();
  
  const { data: popMetric } = await supabase
    .from('health_metrics')
    .select('id')
    .eq('metric_key', 'total_population')
    .single();
  
  if (!popMetric) {
    console.warn('No population metric found - rates will not be calculated');
    return populations;
  }
  
  const { data, error } = await supabase
    .from('health_metric_data')
    .select('geo_fips, estimate')
    .eq('metric_id', (popMetric as any).id)
    .eq('geo_level', 'tract')
    .like('geo_fips', `${stateFips}%`);
  
  if (error) {
    console.error(`Error fetching populations: ${error.message}`);
    return populations;
  }
  
  for (const row of (data as any[]) || []) {
    if (row.estimate && row.geo_fips) {
      populations.set(row.geo_fips, row.estimate);
    }
  }
  
  return populations;
}

function pointInPolygon(point: [number, number], geometry: any): boolean {
  if (!geometry) return false;
  
  const [x, y] = point;
  
  const polygons = geometry.type === 'MultiPolygon' 
    ? geometry.coordinates 
    : geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : [];
  
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
  let unassignedIncidents = 0;
  let skippedNormalizedType = 0;
  
  // Sample first few unassigned for debugging
  const sampleUnassigned: { lat: number; lon: number }[] = [];
  
  for (const incident of incidents) {
    const metricKey = incident.normalized_type as CrimeMetricKey;
    if (!CRIME_METRIC_KEYS.includes(metricKey)) {
      skippedNormalizedType++;
      continue;
    }
    
    let matched = false;
    for (const [tractFips, { geometry }] of tracts) {
      if (pointInPolygon([incident.lon, incident.lat], geometry)) {
        const stats = tractStats.get(tractFips)!;
        stats.crimeCounts[metricKey]++;
        assignedIncidents++;
        matched = true;
        break;
      }
    }
    
    if (!matched) {
      unassignedIncidents++;
      if (sampleUnassigned.length < 5) {
        sampleUnassigned.push({ lat: incident.lat, lon: incident.lon });
      }
    }
  }
  
  // Log aggregation results
  console.log(`    [DEBUG] Aggregation: ${assignedIncidents} assigned, ${unassignedIncidents} unassigned, ${skippedNormalizedType} skipped (unknown type)`);
  if (sampleUnassigned.length > 0 && unassignedIncidents > assignedIncidents) {
    console.log(`    [DEBUG] Sample unassigned coordinates: ${JSON.stringify(sampleUnassigned)}`);
  }
  
  for (const stats of tractStats.values()) {
    if (stats.population >= MIN_POPULATION) {
      for (const metricKey of CRIME_METRIC_KEYS) {
        const count = stats.crimeCounts[metricKey];
        stats.crimeRates[metricKey] = Math.round((count / stats.population) * 100000 * 100) / 100;
      }
    }
  }
  
  // Count tracts with data
  let tractsWithData = 0;
  for (const stats of tractStats.values()) {
    const hasAnyCrime = CRIME_METRIC_KEYS.some(k => stats.crimeCounts[k] > 0);
    if (hasAnyCrime) tractsWithData++;
  }
  console.log(`    [DEBUG] Tracts with crime data: ${tractsWithData}/${tractStats.size}`);
  
  return Array.from(tractStats.values());
}

async function storeRollingWindowData(
  supabase: ReturnType<typeof createClient<any>>,
  stats: TractCrimeStats[],
  metricIdMap: Map<string, string>,
  stateFips: string,
  stateAbbr: string,
  dataPeriod: string,
  dryRun: boolean
): Promise<{ inserted: number; errors: number }> {
  if (dryRun) {
    const totalRecords = stats.filter(s => s.population >= MIN_POPULATION).length * CRIME_METRIC_KEYS.length;
    console.log(`    [DRY RUN] Would upsert up to ${totalRecords} records`);
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
          period_type: 'rolling',
          source_name: 'Crime Incidents (Rolling)',
          group_name: 'Total',
        });
      }
    }
  }
  
  if (rows.length === 0) {
    return { inserted: 0, errors: 0 };
  }
  
  let inserted = 0;
  let errors = 0;
  
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    
    const { error } = await (supabase as any)
      .from('health_metric_data')
      .upsert(batch, {
        onConflict: 'metric_id,geo_fips,data_period,group_name',
        ignoreDuplicates: false,
      });
    
    if (error) {
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
  }
  
  return { inserted, errors };
}

async function processCity(
  supabase: ReturnType<typeof createClient<any>>,
  city: CityInfo,
  metricIdMap: Map<string, string>,
  windows: { months: number; period: string }[],
  dryRun: boolean
): Promise<{ city: string; results: Record<string, { incidents: number; inserted: number; errors: number }> }> {
  const results: Record<string, { incidents: number; inserted: number; errors: number }> = {};
  
  const tracts = await getTractBoundaries(city.stateFips);
  if (tracts.size === 0) {
    console.log(`  ${city.city}, ${city.state}: No tract boundaries found, skipping`);
    return { city: city.city, results };
  }
  
  const populations = await getTractPopulations(supabase, city.stateFips);
  
  for (const window of windows) {
    const incidents = await getIncidentsInWindow(supabase, city.city, city.state, window.months);
    
    if (incidents.length === 0) {
      results[window.period] = { incidents: 0, inserted: 0, errors: 0 };
      continue;
    }
    
    const stats = aggregateIncidentsToTracts(incidents, tracts, populations);
    const { inserted, errors } = await storeRollingWindowData(
      supabase,
      stats,
      metricIdMap,
      city.stateFips,
      city.state,
      window.period,
      dryRun
    );
    
    results[window.period] = { incidents: incidents.length, inserted, errors };
  }
  
  return { city: city.city, results };
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
  
  const stateIndex = args.indexOf('--state');
  const stateFilter = stateIndex !== -1 ? args[stateIndex + 1] : undefined;
  const dryRun = args.includes('--dry-run');
  const only12mo = args.includes('--12mo-only');
  const only36mo = args.includes('--36mo-only');
  
  const windows: { months: number; period: string }[] = [];
  if (!only36mo) windows.push({ months: 12, period: '12mo_rolling' });
  if (!only12mo) windows.push({ months: 36, period: '36mo_rolling' });
  
  console.log('='.repeat(70));
  console.log('Crime Rolling Window Refresh');
  console.log('='.repeat(70));
  console.log(`Windows: ${windows.map(w => w.period).join(', ')}`);
  if (stateFilter) console.log(`State filter: ${stateFilter}`);
  if (dryRun) console.log('Mode: DRY RUN');
  console.log('');
  
  const metricIdMap = await getMetricIds(supabase);
  if (metricIdMap.size === 0) {
    console.error('Cannot proceed without crime metrics. Exiting.');
    process.exit(1);
  }
  
  const cities = getCitiesFromConfig(stateFilter);
  if (cities.length === 0) {
    console.log('No cities with crime data found.');
    return;
  }
  
  console.log(`\nProcessing ${cities.length} cities...\n`);
  
  const summary = {
    citiesProcessed: 0,
    totalIncidents12mo: 0,
    totalIncidents36mo: 0,
    totalInserted: 0,
    totalErrors: 0,
  };
  
  for (const city of cities) {
    process.stdout.write(`  ${city.city}, ${city.state}... `);
    
    try {
      const { results } = await processCity(supabase, city, metricIdMap, windows, dryRun);
      
      const parts: string[] = [];
      for (const window of windows) {
        const r = results[window.period];
        if (r) {
          parts.push(`${window.period}: ${r.incidents} incidents → ${r.inserted} records`);
          if (window.period === '12mo_rolling') summary.totalIncidents12mo += r.incidents;
          if (window.period === '36mo_rolling') summary.totalIncidents36mo += r.incidents;
          summary.totalInserted += r.inserted;
          summary.totalErrors += r.errors;
        }
      }
      
      console.log(parts.join(' | ') || 'no data');
      summary.citiesProcessed++;
    } catch (error) {
      console.log(`ERROR: ${error instanceof Error ? error.message : error}`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('Summary');
  console.log('='.repeat(70));
  console.log(`Cities processed: ${summary.citiesProcessed}`);
  if (windows.find(w => w.period === '12mo_rolling')) {
    console.log(`12mo incidents: ${summary.totalIncidents12mo.toLocaleString()}`);
  }
  if (windows.find(w => w.period === '36mo_rolling')) {
    console.log(`36mo incidents: ${summary.totalIncidents36mo.toLocaleString()}`);
  }
  console.log(`Records upserted: ${summary.totalInserted.toLocaleString()}`);
  if (summary.totalErrors > 0) {
    console.log(`Errors: ${summary.totalErrors}`);
  }
  console.log('');
}

main().catch(console.error);
