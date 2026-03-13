#!/usr/bin/env npx tsx
/**
 * Ingest churches from OpenStreetMap via Overpass API
 * 
 * Usage: 
 *   npx tsx scripts/ingest-churches-overpass.ts --state MI
 *   npx tsx scripts/ingest-churches-overpass.ts --state MI --dry-run
 * 
 * Process:
 * 1. Query Overpass API for Christian places of worship in state bbox
 * 2. Deduplicate by OSM ID and normalized name/address
 * 3. Upsert into Supabase churches table
 * 4. Run boundary relink after import
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// State bounding boxes (approximate)
const STATE_BBOXES: Record<string, { south: number; west: number; north: number; east: number; fips: string }> = {
  AL: { south: 30.2, west: -88.5, north: 35.0, east: -84.9, fips: '01' },
  AK: { south: 51.2, west: -179.2, north: 71.4, east: -129.9, fips: '02' },
  AZ: { south: 31.3, west: -114.8, north: 37.0, east: -109.0, fips: '04' },
  AR: { south: 33.0, west: -94.6, north: 36.5, east: -89.6, fips: '05' },
  CA: { south: 32.5, west: -124.4, north: 42.0, east: -114.1, fips: '06' },
  CO: { south: 37.0, west: -109.1, north: 41.0, east: -102.0, fips: '08' },
  CT: { south: 41.0, west: -73.7, north: 42.1, east: -71.8, fips: '09' },
  DE: { south: 38.5, west: -75.8, north: 39.8, east: -75.0, fips: '10' },
  FL: { south: 24.5, west: -87.6, north: 31.0, east: -80.0, fips: '12' },
  GA: { south: 30.4, west: -85.6, north: 35.0, east: -80.8, fips: '13' },
  HI: { south: 18.9, west: -160.2, north: 22.2, east: -154.8, fips: '15' },
  ID: { south: 42.0, west: -117.2, north: 49.0, east: -111.0, fips: '16' },
  IL: { south: 37.0, west: -91.5, north: 42.5, east: -87.0, fips: '17' },
  IN: { south: 37.8, west: -88.1, north: 41.8, east: -84.8, fips: '18' },
  IA: { south: 40.4, west: -96.6, north: 43.5, east: -90.1, fips: '19' },
  KS: { south: 37.0, west: -102.1, north: 40.0, east: -94.6, fips: '20' },
  KY: { south: 36.5, west: -89.6, north: 39.1, east: -82.0, fips: '21' },
  LA: { south: 29.0, west: -94.0, north: 33.0, east: -89.0, fips: '22' },
  ME: { south: 43.1, west: -71.1, north: 47.5, east: -66.9, fips: '23' },
  MD: { south: 37.9, west: -79.5, north: 39.7, east: -75.0, fips: '24' },
  MA: { south: 41.2, west: -73.5, north: 42.9, east: -69.9, fips: '25' },
  MI: { south: 41.7, west: -90.5, north: 48.3, east: -82.4, fips: '26' },
  MN: { south: 43.5, west: -97.2, north: 49.4, east: -89.5, fips: '27' },
  MS: { south: 30.2, west: -91.7, north: 35.0, east: -88.1, fips: '28' },
  MO: { south: 36.0, west: -95.8, north: 40.6, east: -89.1, fips: '29' },
  MT: { south: 44.4, west: -116.0, north: 49.0, east: -104.0, fips: '30' },
  NE: { south: 40.0, west: -104.1, north: 43.0, east: -95.3, fips: '31' },
  NV: { south: 35.0, west: -120.0, north: 42.0, east: -114.0, fips: '32' },
  NH: { south: 42.7, west: -72.6, north: 45.3, east: -70.7, fips: '33' },
  NJ: { south: 38.9, west: -75.6, north: 41.4, east: -73.9, fips: '34' },
  NM: { south: 31.3, west: -109.1, north: 37.0, east: -103.0, fips: '35' },
  NY: { south: 40.5, west: -79.8, north: 45.0, east: -71.9, fips: '36' },
  NC: { south: 33.8, west: -84.3, north: 36.6, east: -75.5, fips: '37' },
  ND: { south: 45.9, west: -104.1, north: 49.0, east: -96.6, fips: '38' },
  OH: { south: 38.4, west: -84.8, north: 42.0, east: -80.5, fips: '39' },
  OK: { south: 33.6, west: -103.0, north: 37.0, east: -94.4, fips: '40' },
  OR: { south: 42.0, west: -124.6, north: 46.3, east: -116.5, fips: '41' },
  PA: { south: 39.7, west: -80.5, north: 42.3, east: -74.7, fips: '42' },
  RI: { south: 41.1, west: -71.9, north: 42.0, east: -71.1, fips: '44' },
  SC: { south: 32.0, west: -83.4, north: 35.2, east: -78.5, fips: '45' },
  SD: { south: 42.5, west: -104.1, north: 46.0, east: -96.4, fips: '46' },
  TN: { south: 35.0, west: -90.3, north: 36.7, east: -81.6, fips: '47' },
  TX: { south: 25.8, west: -106.6, north: 36.5, east: -93.5, fips: '48' },
  UT: { south: 37.0, west: -114.1, north: 42.0, east: -109.0, fips: '49' },
  VT: { south: 42.7, west: -73.4, north: 45.0, east: -71.5, fips: '50' },
  VA: { south: 36.5, west: -83.7, north: 39.5, east: -75.2, fips: '51' },
  WA: { south: 45.5, west: -124.8, north: 49.0, east: -116.9, fips: '53' },
  WV: { south: 37.2, west: -82.6, north: 40.6, east: -77.7, fips: '54' },
  WI: { south: 42.5, west: -92.9, north: 47.1, east: -86.8, fips: '55' },
  WY: { south: 41.0, west: -111.1, north: 45.0, east: -104.1, fips: '56' },
  DC: { south: 38.8, west: -77.1, north: 39.0, east: -76.9, fips: '11' },
};

interface OSMElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface ChurchData {
  external_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string;
  zip: string | null;
  latitude: number;
  longitude: number;
  denomination: string | null;
  website: string | null;
  phone: string | null;
  source: string;
}

function normalizeString(s: string | undefined | null): string {
  if (!s) return '';
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseOSMElement(element: OSMElement, stateCode: string): ChurchData | null {
  const tags = element.tags || {};
  
  // Get coordinates
  let lat: number | undefined;
  let lon: number | undefined;
  
  if (element.type === 'node') {
    lat = element.lat;
    lon = element.lon;
  } else if (element.center) {
    lat = element.center.lat;
    lon = element.center.lon;
  }
  
  if (!lat || !lon) return null;
  
  // Get name - require a name
  const name = tags.name || tags['name:en'];
  if (!name) return null;
  
  // Build address
  const street = tags['addr:street'];
  const houseNumber = tags['addr:housenumber'];
  const address = street ? (houseNumber ? `${houseNumber} ${street}` : street) : null;
  
  return {
    external_id: `osm_${element.type}_${element.id}`,
    name,
    address,
    city: tags['addr:city'] || null,
    state: stateCode,
    zip: tags['addr:postcode'] || null,
    latitude: lat,
    longitude: lon,
    denomination: tags.denomination || tags.religion_denomination || null,
    website: tags.website || tags['contact:website'] || null,
    phone: tags.phone || tags['contact:phone'] || null,
    source: 'openstreetmap'
  };
}

async function fetchOverpassData(bbox: { south: number; west: number; north: number; east: number }, retries: number = 3): Promise<OSMElement[]> {
  const query = `
    [out:json][timeout:300];
    (
      node["amenity"="place_of_worship"]["religion"="christian"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      way["amenity"="place_of_worship"]["religion"="christian"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
      relation["amenity"="place_of_worship"]["religion"="christian"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
    );
    out center;
  `;
  
  const url = 'https://overpass-api.de/api/interpreter';
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Fetching from Overpass API (attempt ${attempt}/${retries})...`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`
      });
      
      if (response.status === 429 || response.status === 504) {
        // Rate limited or timeout - wait and retry
        const waitTime = attempt * 30000; // 30s, 60s, 90s
        console.log(`  Rate limited/timeout, waiting ${waitTime/1000}s...`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }
      
      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.elements || [];
    } catch (error) {
      if (attempt === retries) throw error;
      const waitTime = attempt * 10000;
      console.log(`  Error, retrying in ${waitTime/1000}s...`);
      await new Promise(r => setTimeout(r, waitTime));
    }
  }
  
  return [];
}

function deduplicateChurches(churches: ChurchData[]): ChurchData[] {
  const seen = new Map<string, ChurchData>();
  const seenByNameLoc = new Map<string, ChurchData>();
  const seenByGridCell = new Map<string, ChurchData[]>();
  let dupByOsmId = 0;
  let dupByNameAddr = 0;
  
  // Grid cell size ~100m (0.001 degrees ≈ 111m)
  const GRID_SIZE = 0.001;
  const getGridKey = (lat: number, lon: number) => 
    `${Math.floor(lat / GRID_SIZE)},${Math.floor(lon / GRID_SIZE)}`;
  
  for (const church of churches) {
    // Primary key: external_id (OSM ID)
    if (seen.has(church.external_id)) {
      dupByOsmId++;
      continue;
    }
    
    // Secondary: normalized name + address combo
    const normalizedName = normalizeString(church.name);
    const normalizedAddr = normalizeString(church.address || '');
    const nameAddrKey = `${normalizedName}|${normalizedAddr}`;
    
    let isDuplicate = false;
    
    // Check for same name/address combo within proximity
    const existingByNameAddr = seenByNameLoc.get(nameAddrKey);
    if (existingByNameAddr) {
      const latDiff = Math.abs(church.latitude - existingByNameAddr.latitude);
      const lonDiff = Math.abs(church.longitude - existingByNameAddr.longitude);
      const approxMeters = Math.sqrt(latDiff ** 2 + lonDiff ** 2) * 111000;
      
      if (approxMeters < 200) {
        isDuplicate = true;
        dupByNameAddr++;
      }
    }
    
    // Check nearby grid cells for same name (O(1) lookup instead of O(n))
    if (!isDuplicate && normalizedName.length > 5) {
      const gridKey = getGridKey(church.latitude, church.longitude);
      const nearbyChurches = seenByGridCell.get(gridKey) || [];
      
      for (const existing of nearbyChurches) {
        const existingNorm = normalizeString(existing.name);
        if (normalizedName === existingNorm) {
          const latDiff = Math.abs(church.latitude - existing.latitude);
          const lonDiff = Math.abs(church.longitude - existing.longitude);
          const approxMeters = Math.sqrt(latDiff ** 2 + lonDiff ** 2) * 111000;
          
          if (approxMeters < 100) {
            isDuplicate = true;
            dupByNameAddr++;
            break;
          }
        }
      }
    }
    
    if (!isDuplicate) {
      seen.set(church.external_id, church);
      seenByNameLoc.set(nameAddrKey, church);
      
      // Add to grid cell index
      const gridKey = getGridKey(church.latitude, church.longitude);
      if (!seenByGridCell.has(gridKey)) {
        seenByGridCell.set(gridKey, []);
      }
      seenByGridCell.get(gridKey)!.push(church);
    }
  }
  
  if (dupByOsmId > 0 || dupByNameAddr > 0) {
    console.log(`  Removed ${dupByOsmId} by OSM ID, ${dupByNameAddr} by name/address proximity`);
  }
  
  return Array.from(seen.values());
}

async function upsertChurches(churches: ChurchData[], dryRun: boolean): Promise<number> {
  if (dryRun) {
    console.log(`  [DRY RUN] Would upsert ${churches.length} churches`);
    return churches.length;
  }
  
  let upserted = 0;
  const BATCH_SIZE = 100;
  
  for (let i = 0; i < churches.length; i += BATCH_SIZE) {
    const batch = churches.slice(i, i + BATCH_SIZE);
    
    // Convert to Supabase format with location as PostGIS point
    const records = batch.map(c => ({
      external_id: c.external_id,
      name: c.name,
      address: c.address,
      city: c.city,
      state: c.state,
      zip: c.zip,
      location: `SRID=4326;POINT(${c.longitude} ${c.latitude})`,
      denomination: c.denomination,
      website: c.website,
      phone: c.phone,
      source: c.source
    }));
    
    // Use insert - external_id doesn't have unique constraint in production
    // Duplicates are handled by our deduplication logic
    const { error } = await supabase
      .from('churches')
      .insert(records);
    
    if (error) {
      console.error(`  Error upserting batch: ${error.message}`);
    } else {
      upserted += batch.length;
    }
    
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= churches.length) {
      console.log(`  Upserted ${Math.min(i + BATCH_SIZE, churches.length)}/${churches.length}`);
    }
  }
  
  return upserted;
}

async function recordIngestionRun(
  state: string,
  status: 'running' | 'completed' | 'failed',
  counts: { fetched: number; inserted: number; skipped: number },
  error?: string
) {
  try {
    if (status === 'running') {
      const { data } = await supabase
        .from('ingestion_runs')
        .insert({
          dataset: 'churches',
          state,
          status: 'running',
          features_fetched: 0,
          features_inserted: 0,
          features_skipped: 0
        })
        .select('id')
        .single();
      return data?.id;
    } else {
      await supabase
        .from('ingestion_runs')
        .update({
          status,
          completed_at: new Date().toISOString(),
          features_fetched: counts.fetched,
          features_inserted: counts.inserted,
          features_skipped: counts.skipped,
          error_message: error || null
        })
        .eq('dataset', 'churches')
        .eq('state', state)
        .eq('status', 'running');
    }
  } catch (e) {
    console.log('  Warning: Could not record ingestion run');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const stateIndex = args.indexOf('--state');
  const dryRun = args.includes('--dry-run');
  
  if (stateIndex === -1 || !args[stateIndex + 1]) {
    console.log('Usage: npx tsx scripts/ingest-churches-overpass.ts --state MI [--dry-run]');
    console.log('\nAvailable states:', Object.keys(STATE_BBOXES).join(', '));
    process.exit(1);
  }
  
  const stateCode = args[stateIndex + 1].toUpperCase();
  const stateBbox = STATE_BBOXES[stateCode];
  
  if (!stateBbox) {
    console.error(`Unknown state: ${stateCode}`);
    process.exit(1);
  }
  
  console.log(`=== Ingest Churches from OpenStreetMap ===`);
  console.log(`State: ${stateCode} (FIPS: ${stateBbox.fips})`);
  console.log(`Bbox: [${stateBbox.south}, ${stateBbox.west}, ${stateBbox.north}, ${stateBbox.east}]`);
  if (dryRun) console.log(`Mode: DRY RUN`);
  console.log('');
  
  // Record start of ingestion
  if (!dryRun) {
    await recordIngestionRun(stateCode, 'running', { fetched: 0, inserted: 0, skipped: 0 });
  }
  
  try {
    // Fetch from Overpass
    const elements = await fetchOverpassData(stateBbox);
    console.log(`Fetched ${elements.length} elements from Overpass`);
    
    // Parse elements
    const churches: ChurchData[] = [];
    let skipped = 0;
    
    for (const element of elements) {
      const church = parseOSMElement(element, stateCode);
      if (church) {
        churches.push(church);
      } else {
        skipped++;
      }
    }
    
    console.log(`Parsed ${churches.length} churches (${skipped} skipped - missing name or coords)`);
    
    // Deduplicate
    const unique = deduplicateChurches(churches);
    console.log(`After deduplication: ${unique.length} unique churches`);
    
    // Upsert to Supabase
    console.log('\nUpserting to Supabase...');
    const upserted = await upsertChurches(unique, dryRun);
    
    console.log(`\n✅ Complete!`);
    console.log(`   State: ${stateCode}`);
    console.log(`   Churches imported: ${upserted}`);
    
    // Record completion
    if (!dryRun) {
      await recordIngestionRun(stateCode, 'completed', {
        fetched: elements.length,
        inserted: upserted,
        skipped: elements.length - unique.length
      });
    }
    
    if (!dryRun) {
      console.log(`\nNext step: Run boundary relink`);
      console.log(`   npx tsx scripts/relink-all-churches.ts`);
    }
    
  } catch (error) {
    console.error('Error:', error);
    if (!dryRun) {
      await recordIngestionRun(stateCode, 'failed', { fetched: 0, inserted: 0, skipped: 0 }, String(error));
    }
    process.exit(1);
  }
}

main();
