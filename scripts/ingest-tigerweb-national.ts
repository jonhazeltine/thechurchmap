#!/usr/bin/env npx tsx
/**
 * TIGERweb National Boundary Ingestion Script
 * 
 * Fetches boundary data from US Census TIGERweb REST API for the entire USA:
 * - States (Layer 80 from tigerWMS_Current)
 * - Counties (Layer 84 from tigerWMS_Current)
 * - Census Tracts (Layer 8 from tigerWMS_Current)
 * - ZIP Code Tabulation Areas (Layer 2 from tigerWMS_Current - labeled as ZCTA5)
 * - Incorporated Places / Cities (Layer 28 from tigerWMS_Current)
 * - School Districts - Unified (Layer 0 from TIGERweb/School MapServer)
 * - School Districts - Elementary (Layer 2 from TIGERweb/School MapServer)
 * - School Districts - Secondary (Layer 1 from TIGERweb/School MapServer)
 * 
 * Usage: 
 *   npx tsx scripts/ingest-tigerweb-national.ts --type states
 *   npx tsx scripts/ingest-tigerweb-national.ts --type counties --state 26
 *   npx tsx scripts/ingest-tigerweb-national.ts --type all --state 26
 *   npx tsx scripts/ingest-tigerweb-national.ts --type zips  (all US ZIPs)
 *   npx tsx scripts/ingest-tigerweb-national.ts --type schools --state 26
 * 
 * See docs/DATA_INGESTION_GUIDE.md for data ingestion rules.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TIGERWEB_BASE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer';
const STATE_COUNTY_BASE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer';
const SCHOOL_BASE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/School/MapServer';

// US State FIPS codes
const US_STATES: { fips: string; name: string; abbr: string }[] = [
  { fips: '01', name: 'Alabama', abbr: 'AL' },
  { fips: '02', name: 'Alaska', abbr: 'AK' },
  { fips: '04', name: 'Arizona', abbr: 'AZ' },
  { fips: '05', name: 'Arkansas', abbr: 'AR' },
  { fips: '06', name: 'California', abbr: 'CA' },
  { fips: '08', name: 'Colorado', abbr: 'CO' },
  { fips: '09', name: 'Connecticut', abbr: 'CT' },
  { fips: '10', name: 'Delaware', abbr: 'DE' },
  { fips: '11', name: 'District of Columbia', abbr: 'DC' },
  { fips: '12', name: 'Florida', abbr: 'FL' },
  { fips: '13', name: 'Georgia', abbr: 'GA' },
  { fips: '15', name: 'Hawaii', abbr: 'HI' },
  { fips: '16', name: 'Idaho', abbr: 'ID' },
  { fips: '17', name: 'Illinois', abbr: 'IL' },
  { fips: '18', name: 'Indiana', abbr: 'IN' },
  { fips: '19', name: 'Iowa', abbr: 'IA' },
  { fips: '20', name: 'Kansas', abbr: 'KS' },
  { fips: '21', name: 'Kentucky', abbr: 'KY' },
  { fips: '22', name: 'Louisiana', abbr: 'LA' },
  { fips: '23', name: 'Maine', abbr: 'ME' },
  { fips: '24', name: 'Maryland', abbr: 'MD' },
  { fips: '25', name: 'Massachusetts', abbr: 'MA' },
  { fips: '26', name: 'Michigan', abbr: 'MI' },
  { fips: '27', name: 'Minnesota', abbr: 'MN' },
  { fips: '28', name: 'Mississippi', abbr: 'MS' },
  { fips: '29', name: 'Missouri', abbr: 'MO' },
  { fips: '30', name: 'Montana', abbr: 'MT' },
  { fips: '31', name: 'Nebraska', abbr: 'NE' },
  { fips: '32', name: 'Nevada', abbr: 'NV' },
  { fips: '33', name: 'New Hampshire', abbr: 'NH' },
  { fips: '34', name: 'New Jersey', abbr: 'NJ' },
  { fips: '35', name: 'New Mexico', abbr: 'NM' },
  { fips: '36', name: 'New York', abbr: 'NY' },
  { fips: '37', name: 'North Carolina', abbr: 'NC' },
  { fips: '38', name: 'North Dakota', abbr: 'ND' },
  { fips: '39', name: 'Ohio', abbr: 'OH' },
  { fips: '40', name: 'Oklahoma', abbr: 'OK' },
  { fips: '41', name: 'Oregon', abbr: 'OR' },
  { fips: '42', name: 'Pennsylvania', abbr: 'PA' },
  { fips: '44', name: 'Rhode Island', abbr: 'RI' },
  { fips: '45', name: 'South Carolina', abbr: 'SC' },
  { fips: '46', name: 'South Dakota', abbr: 'SD' },
  { fips: '47', name: 'Tennessee', abbr: 'TN' },
  { fips: '48', name: 'Texas', abbr: 'TX' },
  { fips: '49', name: 'Utah', abbr: 'UT' },
  { fips: '50', name: 'Vermont', abbr: 'VT' },
  { fips: '51', name: 'Virginia', abbr: 'VA' },
  { fips: '53', name: 'Washington', abbr: 'WA' },
  { fips: '54', name: 'West Virginia', abbr: 'WV' },
  { fips: '55', name: 'Wisconsin', abbr: 'WI' },
  { fips: '56', name: 'Wyoming', abbr: 'WY' },
  // Territories
  { fips: '60', name: 'American Samoa', abbr: 'AS' },
  { fips: '66', name: 'Guam', abbr: 'GU' },
  { fips: '69', name: 'Northern Mariana Islands', abbr: 'MP' },
  { fips: '72', name: 'Puerto Rico', abbr: 'PR' },
  { fips: '78', name: 'U.S. Virgin Islands', abbr: 'VI' },
];

// TIGERweb layer configurations
const LAYERS = {
  states: { 
    id: 80, 
    base: TIGERWEB_BASE,
    type: 'state', 
    stateField: null, 
    nameField: 'NAME', 
    geoidField: 'GEOID',
    source: 'tigerweb_2024'
  },
  counties: { 
    id: 1, 
    base: STATE_COUNTY_BASE,
    type: 'county', 
    stateField: 'STATE', 
    nameField: 'BASENAME', 
    geoidField: 'GEOID',
    source: 'tigerweb_2024'
  },
  tracts: { 
    id: 8, 
    base: TIGERWEB_BASE,
    type: 'census_tract', 
    stateField: 'STATE', 
    nameField: 'NAME', 
    geoidField: 'GEOID',
    source: 'tigerweb_2024'
  },
  zips: { 
    id: 2, 
    base: TIGERWEB_BASE,
    type: 'zip', 
    stateField: null, 
    nameField: 'ZCTA5', 
    geoidField: 'GEOID',
    source: 'tigerweb_2024'
  },
  places: { 
    id: 28, 
    base: TIGERWEB_BASE,
    type: 'place', 
    stateField: 'STATE', 
    nameField: 'NAME', 
    geoidField: 'GEOID',
    source: 'tigerweb_2024'
  },
  schools_unified: {
    id: 0,
    base: SCHOOL_BASE,
    type: 'school_district',
    stateField: 'STATE',
    nameField: 'NAME',
    geoidField: 'GEOID',
    source: 'tigerweb_school_2024'
  },
  schools_elementary: {
    id: 2,
    base: SCHOOL_BASE,
    type: 'school_district',
    stateField: 'STATE',
    nameField: 'NAME',
    geoidField: 'GEOID',
    source: 'tigerweb_school_2024'
  },
  schools_secondary: {
    id: 1,
    base: SCHOOL_BASE,
    type: 'school_district',
    stateField: 'STATE',
    nameField: 'NAME',
    geoidField: 'GEOID',
    source: 'tigerweb_school_2024'
  },
};

interface BoundaryRecord {
  external_id: string;
  name: string;
  type: string;
  geometry: any; // GeoJSON
  source: string;
  state_fips?: string;
  county_fips?: string;
}

interface LayerConfig {
  id: number;
  base: string;
  type: string;
  stateField: string | null;
  nameField: string;
  geoidField: string;
  source: string;
}

const BATCH_SIZE = 50;
const PARALLEL_LIMIT = 5;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      
      // Retry on 5xx server errors
      if (response.status >= 500 && attempt < maxRetries) {
        console.log(`    Server error ${response.status}, retry ${attempt}/${maxRetries}...`);
        await sleep(1000 * attempt); // Exponential backoff
        continue;
      }
      
      return response;
    } catch (error: any) {
      lastError = error;
      if (attempt < maxRetries) {
        console.log(`    Fetch error, retry ${attempt}/${maxRetries}: ${error.message}`);
        await sleep(1000 * attempt);
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

async function fetchLayerFeatures(
  layerConfig: LayerConfig,
  stateFips?: string
): Promise<BoundaryRecord[]> {
  const boundaries: BoundaryRecord[] = [];
  let offset = 0;
  const batchSize = 100;
  let hasMore = true;
  
  // Build WHERE clause
  let whereClause: string;
  if (layerConfig.stateField && stateFips) {
    whereClause = `${layerConfig.stateField}='${stateFips}'`;
  } else if (layerConfig.type === 'state') {
    whereClause = '1=1'; // All states
  } else if (layerConfig.type === 'zip') {
    // ZCTAs don't filter by state well, fetch all
    whereClause = '1=1';
  } else {
    whereClause = '1=1';
  }
  
  console.log(`  Fetching ${layerConfig.type} from layer ${layerConfig.id}...`);
  
  while (hasMore) {
    const params = new URLSearchParams({
      where: whereClause,
      outFields: '*',
      f: 'geojson',
      resultOffset: String(offset),
      resultRecordCount: String(batchSize),
      outSR: '4326',
    });
    
    const url = `${layerConfig.base}/${layerConfig.id}/query?${params.toString()}`;
    
    try {
      const response = await fetchWithRetry(url);
      if (!response.ok) {
        console.error(`    API error: ${response.status} ${response.statusText}`);
        break;
      }
      
      const data = await response.json();
      
      if (!data.features || data.features.length === 0) {
        hasMore = false;
        continue;
      }
      
      for (const feature of data.features) {
        const props = feature.properties;
        const name = props[layerConfig.nameField];
        const geoid = props[layerConfig.geoidField];
        
        if (!name || !geoid || !feature.geometry) {
          continue;
        }
        
        const record: BoundaryRecord = {
          external_id: geoid,
          name: name,
          type: layerConfig.type,
          geometry: feature.geometry,
          source: layerConfig.source,
        };
        
        // Extract state and county FIPS from GEOID where applicable
        if (geoid.length >= 2) {
          record.state_fips = geoid.substring(0, 2);
        }
        if (geoid.length >= 5 && ['county', 'census_tract', 'place'].includes(layerConfig.type)) {
          record.county_fips = geoid.substring(0, 5);
        }
        
        boundaries.push(record);
      }
      
      if (data.features.length < batchSize) {
        hasMore = false;
      } else {
        offset += batchSize;
        await sleep(100); // Rate limiting
      }
      
    } catch (error: any) {
      console.error(`    Error at offset ${offset}:`, error.message);
      offset += batchSize;
      await sleep(500);
    }
  }
  
  return boundaries;
}

async function importBoundaries(boundaries: BoundaryRecord[]): Promise<{ success: number; failed: number }> {
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalErrors = 0;
  
  console.log(`  Importing ${boundaries.length} boundaries...`);
  
  // Import in batches using RPC function
  const IMPORT_BATCH_SIZE = 20;
  
  for (let i = 0; i < boundaries.length; i += IMPORT_BATCH_SIZE) {
    const batch = boundaries.slice(i, i + IMPORT_BATCH_SIZE);
    
    // Convert geometries to JSON strings for the RPC function
    const boundaryData = batch.map(b => ({
      external_id: b.external_id,
      name: b.name,
      type: b.type,
      geometry: JSON.stringify(b.geometry),
      source: b.source,
      state_fips: b.state_fips || null,
      county_fips: b.county_fips || null,
    }));
    
    // Retry RPC calls with exponential backoff
    let rpcSuccess = false;
    for (let attempt = 1; attempt <= 3 && !rpcSuccess; attempt++) {
      const { data, error } = await supabase.rpc('fn_import_boundaries', {
        boundaries_data: boundaryData
      });
      
      if (error) {
        if (attempt < 3) {
          console.log(`    RPC error, retry ${attempt}/3: ${error.message}`);
          await sleep(1000 * attempt);
          continue;
        }
        console.error(`    Batch error after retries:`, error.message);
        totalErrors += batch.length;
      } else if (data) {
        totalInserted += data.inserted || 0;
        totalUpdated += data.updated || 0;
        totalErrors += data.errors || 0;
        rpcSuccess = true;
      }
    }
    
    if ((i + IMPORT_BATCH_SIZE) % 100 === 0 || i + IMPORT_BATCH_SIZE >= boundaries.length) {
      console.log(`    Progress: ${Math.min(i + IMPORT_BATCH_SIZE, boundaries.length)}/${boundaries.length}`);
    }
    
    await sleep(50); // Rate limiting
  }
  
  console.log(`    Inserted: ${totalInserted}, Updated: ${totalUpdated}, Errors: ${totalErrors}`);
  return { success: totalInserted + totalUpdated, failed: totalErrors };
}

async function ingestStates(): Promise<void> {
  console.log('\n=== Ingesting US States ===');
  const boundaries = await fetchLayerFeatures(LAYERS.states);
  console.log(`  Found ${boundaries.length} states`);
  const result = await importBoundaries(boundaries);
  console.log(`  Complete: ${result.success} success, ${result.failed} failed`);
}

async function ingestCounties(stateFips?: string): Promise<void> {
  const states = stateFips ? [US_STATES.find(s => s.fips === stateFips)!] : US_STATES;
  
  console.log(`\n=== Ingesting Counties for ${states.length} state(s) ===`);
  
  for (const state of states) {
    if (!state) continue;
    console.log(`\n  Processing ${state.name} (${state.fips})...`);
    const boundaries = await fetchLayerFeatures(LAYERS.counties, state.fips);
    console.log(`    Found ${boundaries.length} counties`);
    const result = await importBoundaries(boundaries);
    console.log(`    Complete: ${result.success} success, ${result.failed} failed`);
    await sleep(200);
  }
}

async function ingestPlaces(stateFips?: string): Promise<void> {
  const states = stateFips ? [US_STATES.find(s => s.fips === stateFips)!] : US_STATES;
  
  console.log(`\n=== Ingesting Places for ${states.length} state(s) ===`);
  
  for (const state of states) {
    if (!state) continue;
    console.log(`\n  Processing ${state.name} (${state.fips})...`);
    const boundaries = await fetchLayerFeatures(LAYERS.places, state.fips);
    console.log(`    Found ${boundaries.length} places`);
    const result = await importBoundaries(boundaries);
    console.log(`    Complete: ${result.success} success, ${result.failed} failed`);
    await sleep(200);
  }
}

async function ingestTracts(stateFips?: string): Promise<void> {
  const states = stateFips ? [US_STATES.find(s => s.fips === stateFips)!] : US_STATES;
  
  console.log(`\n=== Ingesting Census Tracts for ${states.length} state(s) ===`);
  
  for (const state of states) {
    if (!state) continue;
    console.log(`\n  Processing ${state.name} (${state.fips})...`);
    const boundaries = await fetchLayerFeatures(LAYERS.tracts, state.fips);
    console.log(`    Found ${boundaries.length} census tracts`);
    const result = await importBoundaries(boundaries);
    console.log(`    Complete: ${result.success} success, ${result.failed} failed`);
    await sleep(200);
  }
}

// State bounding boxes for ZIP filtering (west, south, east, north)
const STATE_BBOXES: Record<string, [number, number, number, number]> = {
  // Already deployed
  '06': [-124.5, 32.5, -114.1, 42.0], // California
  '26': [-90.5, 41.7, -82.4, 48.3], // Michigan
  '48': [-106.7, 25.8, -93.5, 36.5], // Texas
  // Phase 1: Southeast
  '12': [-87.7, 24.4, -79.9, 31.1], // Florida
  '13': [-85.7, 30.3, -80.7, 35.1], // Georgia
  '37': [-84.4, 33.7, -75.4, 36.6], // North Carolina
  '45': [-83.4, 32.0, -78.5, 35.3], // South Carolina
  // Phase 2: Northeast
  '36': [-79.8, 40.5, -71.9, 45.1], // New York
  '42': [-80.6, 39.7, -74.7, 42.3], // Pennsylvania
  '34': [-75.6, 38.9, -73.9, 41.4], // New Jersey
  '09': [-73.8, 40.9, -71.8, 42.1], // Connecticut
  '25': [-73.5, 41.2, -69.9, 42.9], // Massachusetts
  '44': [-71.9, 41.1, -71.1, 42.0], // Rhode Island
  // Phase 3: Great Lakes
  '39': [-84.9, 38.4, -80.5, 42.0], // Ohio
  '17': [-91.6, 36.9, -87.5, 42.5], // Illinois
  '18': [-88.1, 37.8, -84.8, 41.8], // Indiana
  '55': [-92.9, 42.5, -86.8, 47.1], // Wisconsin
  '27': [-97.3, 43.5, -89.5, 49.4], // Minnesota
  // Phase 4: Mid-Atlantic + New England
  '24': [-79.5, 37.9, -75.0, 39.7], // Maryland
  '51': [-83.7, 36.5, -75.2, 39.5], // Virginia
  '10': [-75.8, 38.4, -75.0, 39.9], // Delaware
  '54': [-82.7, 37.2, -77.7, 40.6], // West Virginia
  '11': [-77.1, 38.8, -76.9, 39.0], // DC
  '23': [-71.1, 43.0, -66.9, 47.5], // Maine
  '33': [-72.6, 42.7, -70.6, 45.3], // New Hampshire
  '50': [-73.5, 42.7, -71.5, 45.0], // Vermont
  // Phase 5: South Central
  '47': [-90.4, 34.9, -81.6, 36.7], // Tennessee
  '21': [-89.6, 36.5, -81.9, 39.2], // Kentucky
  '01': [-88.5, 30.2, -84.9, 35.0], // Alabama
  '28': [-91.7, 30.2, -88.1, 35.0], // Mississippi
  '22': [-94.1, 28.9, -88.8, 33.0], // Louisiana
  '05': [-94.6, 33.0, -89.6, 36.5], // Arkansas
  // Phase 6: Plains
  '29': [-95.8, 35.9, -89.1, 40.6], // Missouri
  '19': [-96.7, 40.4, -90.1, 43.5], // Iowa
  '20': [-102.1, 37.0, -94.6, 40.0], // Kansas
  '31': [-104.1, 40.0, -95.3, 43.0], // Nebraska
  '40': [-103.0, 33.6, -94.4, 37.0], // Oklahoma
  '38': [-104.1, 45.9, -96.6, 49.0], // North Dakota
  '46': [-104.1, 42.5, -96.4, 46.0], // South Dakota
  // Phase 7: Mountain/Southwest
  '04': [-115.0, 31.3, -109.0, 37.0], // Arizona
  '08': [-109.1, 37.0, -102.0, 41.0], // Colorado
  '35': [-109.1, 31.3, -103.0, 37.0], // New Mexico
  '49': [-114.1, 37.0, -109.0, 42.0], // Utah
  '32': [-120.0, 35.0, -114.0, 42.0], // Nevada
  // Phase 8: Pacific NW + Remote
  '53': [-124.8, 45.5, -116.9, 49.0], // Washington
  '41': [-124.6, 41.9, -116.5, 46.3], // Oregon
  '16': [-117.3, 42.0, -111.0, 49.0], // Idaho
  '30': [-116.1, 44.4, -104.0, 49.0], // Montana
  '56': [-111.1, 41.0, -104.1, 45.0], // Wyoming
  '02': [-180.0, 51.2, -129.0, 71.5], // Alaska
  '15': [-160.3, 18.9, -154.8, 22.3], // Hawaii
};

// Michigan ZIP prefixes (48xxx, 49xxx)
const MICHIGAN_ZIP_PREFIXES = ['48', '49'];

async function fetchZipsWithBbox(bbox: [number, number, number, number], stateFips: string): Promise<BoundaryRecord[]> {
  const boundaries: BoundaryRecord[] = [];
  const [west, south, east, north] = bbox;
  const batchSize = 100;
  let offset = 0;
  let hasMore = true;
  
  console.log(`  Using bounding box: ${west},${south},${east},${north}`);
  
  while (hasMore) {
    const params = new URLSearchParams({
      where: '1=1',
      geometry: `${west},${south},${east},${north}`,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: '*',
      f: 'geojson',
      resultOffset: String(offset),
      resultRecordCount: String(batchSize),
      outSR: '4326',
    });
    
    const url = `${LAYERS.zips.base}/${LAYERS.zips.id}/query?${params.toString()}`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`    API error: ${response.status}, skipping batch and continuing...`);
        offset += batchSize;
        await sleep(1000);
        continue;
      }
      
      const data = await response.json();
      
      if (!data.features || data.features.length === 0) {
        hasMore = false;
        continue;
      }
      
      for (const feature of data.features) {
        const props = feature.properties;
        const name = props[LAYERS.zips.nameField];
        const geoid = props[LAYERS.zips.geoidField];
        
        if (!name || !geoid || !feature.geometry) continue;
        
        boundaries.push({
          external_id: geoid,
          name: name,
          type: 'zip',
          geometry: feature.geometry,
          source: 'tigerweb_2024',
          state_fips: stateFips,
        });
      }
      
      console.log(`    Fetched ${boundaries.length} ZIPs so far...`);
      
      if (data.features.length < batchSize) {
        hasMore = false;
      } else {
        offset += batchSize;
        await sleep(100);
      }
    } catch (error: any) {
      console.error(`    Error: ${error.message}, skipping batch and continuing...`);
      offset += batchSize;
      await sleep(1000);
      continue;
    }
  }
  
  return boundaries;
}

async function ingestZips(stateFips?: string): Promise<void> {
  console.log('\n=== Ingesting ZIP Codes ===');
  
  if (stateFips && STATE_BBOXES[stateFips]) {
    // Use bounding box for state-specific ZIP ingestion
    const state = US_STATES.find(s => s.fips === stateFips);
    console.log(`  Fetching ZIPs for ${state?.name || stateFips}...`);
    
    const boundaries = await fetchZipsWithBbox(STATE_BBOXES[stateFips], stateFips);
    console.log(`  Found ${boundaries.length} ZIP codes`);
    const result = await importBoundaries(boundaries);
    console.log(`  Complete: ${result.success} success, ${result.failed} failed`);
  } else {
    console.log('  Note: This may take a while (~42,000 ZCTAs)');
    const boundaries = await fetchLayerFeatures(LAYERS.zips);
    console.log(`  Found ${boundaries.length} ZIP codes`);
    const result = await importBoundaries(boundaries);
    console.log(`  Complete: ${result.success} success, ${result.failed} failed`);
  }
}

async function ingestSchools(stateFips?: string): Promise<void> {
  const states = stateFips ? [US_STATES.find(s => s.fips === stateFips)!] : US_STATES;
  
  console.log(`\n=== Ingesting School Districts for ${states.length} state(s) ===`);
  
  for (const state of states) {
    if (!state) continue;
    console.log(`\n  Processing ${state.name} (${state.fips})...`);
    
    // Unified districts
    console.log('    Fetching unified districts...');
    const unified = await fetchLayerFeatures(LAYERS.schools_unified, state.fips);
    console.log(`      Found ${unified.length} unified districts`);
    
    // Elementary districts
    console.log('    Fetching elementary districts...');
    const elementary = await fetchLayerFeatures(LAYERS.schools_elementary, state.fips);
    console.log(`      Found ${elementary.length} elementary districts`);
    
    // Secondary districts
    console.log('    Fetching secondary districts...');
    const secondary = await fetchLayerFeatures(LAYERS.schools_secondary, state.fips);
    console.log(`      Found ${secondary.length} secondary districts`);
    
    const all = [...unified, ...elementary, ...secondary];
    console.log(`    Importing ${all.length} total school districts...`);
    const result = await importBoundaries(all);
    console.log(`    Complete: ${result.success} success, ${result.failed} failed`);
    
    await sleep(300);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const typeIdx = args.indexOf('--type');
  const stateIdx = args.indexOf('--state');
  const typeArg = args.find(a => a.startsWith('--type='))?.split('=')[1] ||
                  (typeIdx >= 0 ? args[typeIdx + 1] : undefined);
  const stateArg = args.find(a => a.startsWith('--state='))?.split('=')[1] ||
                   (stateIdx >= 0 ? args[stateIdx + 1] : undefined);
  
  if (!typeArg) {
    console.log(`
Usage: npx tsx scripts/ingest-tigerweb-national.ts --type <type> [--state <fips>]

Types:
  states      - All US states and territories (56 total)
  counties    - All counties (optionally filter by state)
  places      - All incorporated places/cities
  tracts      - Census tracts (for health data overlay)
  zips        - All ZIP code tabulation areas (~42,000)
  schools     - School districts (unified, elementary, secondary)
  all         - All boundary types (requires --state)

Options:
  --state <fips>  - Filter by state FIPS code (e.g., 26 for Michigan)

Examples:
  npx tsx scripts/ingest-tigerweb-national.ts --type states
  npx tsx scripts/ingest-tigerweb-national.ts --type counties --state 26
  npx tsx scripts/ingest-tigerweb-national.ts --type schools --state 06
  npx tsx scripts/ingest-tigerweb-national.ts --type zips
`);
    return;
  }
  
  console.log('='.repeat(60));
  console.log('TIGERweb National Boundary Ingestion');
  console.log('='.repeat(60));
  console.log(`Type: ${typeArg}`);
  if (stateArg) {
    const state = US_STATES.find(s => s.fips === stateArg);
    console.log(`State: ${state?.name || stateArg} (${stateArg})`);
  }
  console.log('');
  
  const startTime = Date.now();
  
  switch (typeArg) {
    case 'states':
      await ingestStates();
      break;
    case 'counties':
      await ingestCounties(stateArg);
      break;
    case 'places':
      await ingestPlaces(stateArg);
      break;
    case 'tracts':
      await ingestTracts(stateArg);
      break;
    case 'zips':
      await ingestZips(stateArg);
      break;
    case 'schools':
      await ingestSchools(stateArg);
      break;
    case 'all':
      if (!stateArg) {
        console.error('Error: --state is required for --type all');
        return;
      }
      await ingestCounties(stateArg);
      await ingestPlaces(stateArg);
      await ingestTracts(stateArg);
      await ingestSchools(stateArg);
      break;
    default:
      console.error(`Unknown type: ${typeArg}`);
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Completed in ${elapsed}s`);
  console.log('='.repeat(60));
}

main().catch(console.error);
