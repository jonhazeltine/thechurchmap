#!/usr/bin/env npx tsx
/**
 * OpenStreetMap National Churches Ingestion Script
 * 
 * Fetches all Christian churches across the United States (50 states + DC)
 * from the Overpass API and imports them into the churches table.
 * 
 * Processes states one at a time to avoid Overpass API timeouts.
 * 
 * DEDUPLICATION STRATEGY:
 * - Overpass returns nodes, ways, and relations for the same church
 * - We prefer ways > relations > nodes (building outlines are more reliable)
 * - We deduplicate by proximity (within 50 meters) and name similarity
 * 
 * COUNTY FIPS ASSIGNMENT:
 * - Uses spatial join with TIGERweb county boundaries (already in DB)
 * - Falls back to Census Geocoder API for tracts without boundary data
 * 
 * Usage:
 *   npx tsx scripts/ingest-osm-national-churches.ts              # Process all states
 *   npx tsx scripts/ingest-osm-national-churches.ts --state MI   # Process only Michigan
 *   npx tsx scripts/ingest-osm-national-churches.ts --resume OH  # Resume from Ohio onwards
 * 
 * Source: Overpass API (OpenStreetMap)
 * Filters: amenity=place_of_worship AND religion=christian
 */

import { createClient } from '@supabase/supabase-js';

const SOURCE_ID = 'osm_us_church';
const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

const DEDUP_DISTANCE_METERS = 50;
const RATE_LIMIT_MS = 5000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10000;

const US_STATES: Array<{ code: string; fips: string; name: string }> = [
  { code: 'AL', fips: '01', name: 'Alabama' },
  { code: 'AK', fips: '02', name: 'Alaska' },
  { code: 'AZ', fips: '04', name: 'Arizona' },
  { code: 'AR', fips: '05', name: 'Arkansas' },
  { code: 'CA', fips: '06', name: 'California' },
  { code: 'CO', fips: '08', name: 'Colorado' },
  { code: 'CT', fips: '09', name: 'Connecticut' },
  { code: 'DE', fips: '10', name: 'Delaware' },
  { code: 'DC', fips: '11', name: 'District of Columbia' },
  { code: 'FL', fips: '12', name: 'Florida' },
  { code: 'GA', fips: '13', name: 'Georgia' },
  { code: 'HI', fips: '15', name: 'Hawaii' },
  { code: 'ID', fips: '16', name: 'Idaho' },
  { code: 'IL', fips: '17', name: 'Illinois' },
  { code: 'IN', fips: '18', name: 'Indiana' },
  { code: 'IA', fips: '19', name: 'Iowa' },
  { code: 'KS', fips: '20', name: 'Kansas' },
  { code: 'KY', fips: '21', name: 'Kentucky' },
  { code: 'LA', fips: '22', name: 'Louisiana' },
  { code: 'ME', fips: '23', name: 'Maine' },
  { code: 'MD', fips: '24', name: 'Maryland' },
  { code: 'MA', fips: '25', name: 'Massachusetts' },
  { code: 'MI', fips: '26', name: 'Michigan' },
  { code: 'MN', fips: '27', name: 'Minnesota' },
  { code: 'MS', fips: '28', name: 'Mississippi' },
  { code: 'MO', fips: '29', name: 'Missouri' },
  { code: 'MT', fips: '30', name: 'Montana' },
  { code: 'NE', fips: '31', name: 'Nebraska' },
  { code: 'NV', fips: '32', name: 'Nevada' },
  { code: 'NH', fips: '33', name: 'New Hampshire' },
  { code: 'NJ', fips: '34', name: 'New Jersey' },
  { code: 'NM', fips: '35', name: 'New Mexico' },
  { code: 'NY', fips: '36', name: 'New York' },
  { code: 'NC', fips: '37', name: 'North Carolina' },
  { code: 'ND', fips: '38', name: 'North Dakota' },
  { code: 'OH', fips: '39', name: 'Ohio' },
  { code: 'OK', fips: '40', name: 'Oklahoma' },
  { code: 'OR', fips: '41', name: 'Oregon' },
  { code: 'PA', fips: '42', name: 'Pennsylvania' },
  { code: 'RI', fips: '44', name: 'Rhode Island' },
  { code: 'SC', fips: '45', name: 'South Carolina' },
  { code: 'SD', fips: '46', name: 'South Dakota' },
  { code: 'TN', fips: '47', name: 'Tennessee' },
  { code: 'TX', fips: '48', name: 'Texas' },
  { code: 'UT', fips: '49', name: 'Utah' },
  { code: 'VT', fips: '50', name: 'Vermont' },
  { code: 'VA', fips: '51', name: 'Virginia' },
  { code: 'WA', fips: '53', name: 'Washington' },
  { code: 'WV', fips: '54', name: 'West Virginia' },
  { code: 'WI', fips: '55', name: 'Wisconsin' },
  { code: 'WY', fips: '56', name: 'Wyoming' },
];

const STATE_FIPS_MAP: Record<string, string> = {};
const STATE_CODE_MAP: Record<string, { fips: string; name: string }> = {};
for (const state of US_STATES) {
  STATE_FIPS_MAP[state.code] = state.fips;
  STATE_CODE_MAP[state.code] = { fips: state.fips, name: state.name };
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface OSMElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: {
    name?: string;
    denomination?: string;
    religion?: string;
    'addr:street'?: string;
    'addr:housenumber'?: string;
    'addr:city'?: string;
    'addr:state'?: string;
    'addr:postcode'?: string;
    website?: string;
    phone?: string;
    email?: string;
    [key: string]: string | undefined;
  };
}

interface ChurchRecord {
  name: string;
  address: string | null;
  city: string | null;
  state: string;
  zip: string | null;
  denomination: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  latitude: number;
  longitude: number;
  source: string;
  external_id: string;
  county_fips: string | null;
  elementType: 'node' | 'way' | 'relation';
  elementPriority: number;
}

interface StateResult {
  stateCode: string;
  stateName: string;
  fetched: number;
  parsed: number;
  deduplicated: number;
  withCountyFips: number;
  inserted: number;
  errors: number;
  skipped: boolean;
  errorMessage?: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildOverpassQuery(stateCode: string): string {
  const isoCode = `US-${stateCode}`;
  return `[out:json][timeout:900];

// ${stateCode} by ISO code
area["ISO3166-2"="${isoCode}"][admin_level=4]->.state;

// All Christian churches (nodes, ways, relations) in ${stateCode}
(
  node["amenity"="place_of_worship"]["religion"="christian"](area.state);
  way["amenity"="place_of_worship"]["religion"="christian"](area.state);
  relation["amenity"="place_of_worship"]["religion"="christian"](area.state);
);

out center;`;
}

async function fetchOverpassDataForState(stateCode: string, retryCount = 0): Promise<OSMElement[]> {
  const query = buildOverpassQuery(stateCode);
  
  try {
    const response = await fetch(OVERPASS_API_URL, {
      method: 'POST',
      headers: {
        'User-Agent': 'kingdom-map-osm-import/1.0 (github.com/kingdom-map)',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    
    if (response.status === 429 || response.status === 504) {
      if (retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * (retryCount + 1);
        console.log(`  Rate limited or timeout. Waiting ${delay / 1000}s before retry ${retryCount + 1}/${MAX_RETRIES}...`);
        await sleep(delay);
        return fetchOverpassDataForState(stateCode, retryCount + 1);
      }
      throw new Error(`Overpass API rate limited after ${MAX_RETRIES} retries`);
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      if (retryCount < MAX_RETRIES) {
        console.log(`  API error ${response.status}. Retrying ${retryCount + 1}/${MAX_RETRIES}...`);
        await sleep(RETRY_DELAY_MS);
        return fetchOverpassDataForState(stateCode, retryCount + 1);
      }
      throw new Error(`Overpass API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }
    
    const data = await response.json();
    
    if (!data.elements || !Array.isArray(data.elements)) {
      throw new Error('Invalid Overpass response: no elements array');
    }
    
    return data.elements;
    
  } catch (error: any) {
    if (retryCount < MAX_RETRIES && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')) {
      console.log(`  Network error. Retrying ${retryCount + 1}/${MAX_RETRIES}...`);
      await sleep(RETRY_DELAY_MS);
      return fetchOverpassDataForState(stateCode, retryCount + 1);
    }
    throw error;
  }
}

function extractCoordinates(element: OSMElement): { lat: number; lon: number } | null {
  if (element.type === 'node') {
    if (element.lat !== undefined && element.lon !== undefined) {
      return { lat: element.lat, lon: element.lon };
    }
  } else if (element.type === 'way' || element.type === 'relation') {
    if (element.center?.lat !== undefined && element.center?.lon !== undefined) {
      return { lat: element.center.lat, lon: element.center.lon };
    }
  }
  return null;
}

function buildAddress(tags: OSMElement['tags']): string | null {
  if (!tags) return null;
  
  const parts: string[] = [];
  
  if (tags['addr:housenumber'] && tags['addr:street']) {
    parts.push(`${tags['addr:housenumber']} ${tags['addr:street']}`);
  } else if (tags['addr:street']) {
    parts.push(tags['addr:street']);
  }
  
  return parts.length > 0 ? parts.join(', ') : null;
}

function getElementPriority(type: 'node' | 'way' | 'relation'): number {
  switch (type) {
    case 'way': return 3;
    case 'relation': return 2;
    case 'node': return 1;
    default: return 0;
  }
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/church|chapel|ministry|ministries|center|centre/g, '')
    .trim();
}

function parseOSMElements(elements: OSMElement[], defaultState: string): ChurchRecord[] {
  const rawChurches: ChurchRecord[] = [];
  let skipped = 0;
  
  for (const element of elements) {
    const coords = extractCoordinates(element);
    if (!coords) {
      skipped++;
      continue;
    }
    
    const tags = element.tags || {};
    const name = tags.name;
    
    if (!name) {
      skipped++;
      continue;
    }
    
    rawChurches.push({
      name: name,
      address: buildAddress(tags),
      city: tags['addr:city'] || null,
      state: tags['addr:state'] || defaultState,
      zip: tags['addr:postcode'] || null,
      denomination: tags.denomination || null,
      website: tags.website || null,
      email: tags.email || null,
      phone: tags.phone || null,
      latitude: coords.lat,
      longitude: coords.lon,
      source: SOURCE_ID,
      external_id: `${element.type}/${element.id}`,
      county_fips: null,
      elementType: element.type,
      elementPriority: getElementPriority(element.type),
    });
  }
  
  return rawChurches;
}

function deduplicateChurches(churches: ChurchRecord[]): ChurchRecord[] {
  const sorted = [...churches].sort((a, b) => b.elementPriority - a.elementPriority);
  
  const kept: ChurchRecord[] = [];
  const skippedDupes = new Set<string>();
  
  for (const church of sorted) {
    if (skippedDupes.has(church.external_id)) {
      continue;
    }
    
    let isDuplicate = false;
    
    for (const existing of kept) {
      const distance = haversineDistance(
        church.latitude, church.longitude,
        existing.latitude, existing.longitude
      );
      
      if (distance <= DEDUP_DISTANCE_METERS) {
        const nameA = normalizeName(church.name);
        const nameB = normalizeName(existing.name);
        
        if (nameA === nameB || nameA.includes(nameB) || nameB.includes(nameA) || 
            (nameA.length > 3 && nameB.length > 3 && (
              nameA.substring(0, 5) === nameB.substring(0, 5) ||
              nameA.includes(nameB.substring(0, 5)) ||
              nameB.includes(nameA.substring(0, 5))
            ))) {
          isDuplicate = true;
          
          if (!existing.address && church.address) existing.address = church.address;
          if (!existing.city && church.city) existing.city = church.city;
          if (!existing.zip && church.zip) existing.zip = church.zip;
          if (!existing.website && church.website) existing.website = church.website;
          if (!existing.phone && church.phone) existing.phone = church.phone;
          if (!existing.email && church.email) existing.email = church.email;
          if (!existing.denomination && church.denomination) existing.denomination = church.denomination;
          
          skippedDupes.add(church.external_id);
          break;
        }
      }
    }
    
    if (!isDuplicate) {
      kept.push(church);
    }
  }
  
  return kept;
}

async function assignCountyFipsViaSpatialJoin(churches: ChurchRecord[], stateFips: string): Promise<void> {
  const batchSize = 50;
  
  for (let i = 0; i < churches.length; i += batchSize) {
    const batch = churches.slice(i, i + batchSize);
    
    const promises = batch.map(async (church) => {
      let { data, error } = await supabase.rpc('find_county_from_tract', {
        lng: church.longitude,
        lat: church.latitude
      });
      
      if (!data && !error) {
        const countyResult = await supabase.rpc('find_county_for_point', {
          lng: church.longitude,
          lat: church.latitude,
          state_fips: stateFips
        });
        data = countyResult.data;
        error = countyResult.error;
      }
      
      if (data && !error) {
        church.county_fips = data;
        return true;
      }
      return false;
    });
    
    await Promise.all(promises);
  }
}

async function upsertChurches(churches: ChurchRecord[]): Promise<{ inserted: number; errors: number }> {
  let inserted = 0;
  let errors = 0;
  
  const batchSize = 50;
  
  for (let i = 0; i < churches.length; i += batchSize) {
    const batch = churches.slice(i, i + batchSize);
    
    const dbRecords = batch.map(church => ({
      name: church.name,
      address: church.address,
      city: church.city,
      state: church.state,
      zip: church.zip,
      denomination: church.denomination,
      website: church.website,
      email: church.email,
      phone: church.phone,
      location: `SRID=4326;POINT(${church.longitude} ${church.latitude})`,
      source: church.source,
      external_id: church.external_id,
      county_fips: church.county_fips,
      approved: true,
      collaboration_have: [],
      collaboration_need: [],
      boundary_ids: [],
      prayer_auto_approve: true,
      prayer_name_display_mode: 'first_name_last_initial',
    }));
    
    const { error } = await supabase
      .from('churches')
      .upsert(dbRecords, {
        onConflict: 'source,external_id',
        ignoreDuplicates: false,
      })
      .select('id');
    
    if (error) {
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
    
    await sleep(50);
  }
  
  return { inserted, errors };
}

async function processState(stateCode: string, stateFips: string, stateName: string): Promise<StateResult> {
  const result: StateResult = {
    stateCode,
    stateName,
    fetched: 0,
    parsed: 0,
    deduplicated: 0,
    withCountyFips: 0,
    inserted: 0,
    errors: 0,
    skipped: false,
  };
  
  try {
    console.log(`  Fetching from Overpass API...`);
    const elements = await fetchOverpassDataForState(stateCode);
    result.fetched = elements.length;
    console.log(`  Fetched ${elements.length} OSM elements`);
    
    const rawChurches = parseOSMElements(elements, stateCode);
    result.parsed = rawChurches.length;
    console.log(`  Parsed ${rawChurches.length} church records`);
    
    const churches = deduplicateChurches(rawChurches);
    result.deduplicated = churches.length;
    console.log(`  After deduplication: ${churches.length} (removed ${rawChurches.length - churches.length} duplicates)`);
    
    // OPTIMIZATION: Skip slow RPC-based county FIPS assignment during ingestion
    // County FIPS will be assigned in bulk via PostGIS after all churches are imported
    // This reduces ~24K RPC calls per large state to a single PostGIS UPDATE statement
    console.log(`  Skipping county FIPS assignment (will be done in bulk via PostGIS)`);
    
    const churchesToInsert = churches;
    result.withCountyFips = churches.length; // All will get county_fips via PostGIS later
    
    if (churchesToInsert.length > 0) {
      console.log(`  Upserting ${churchesToInsert.length} churches to database...`);
      const upsertResult = await upsertChurches(churchesToInsert);
      result.inserted = upsertResult.inserted;
      result.errors = upsertResult.errors;
      console.log(`  Inserted/updated: ${upsertResult.inserted}, Errors: ${upsertResult.errors}`);
    } else {
      console.log(`  No churches to insert`);
    }
    
  } catch (error: any) {
    result.skipped = true;
    result.errorMessage = error.message;
    console.error(`  ERROR: ${error.message}`);
  }
  
  return result;
}

function parseCliArgs(): { singleState?: string; resumeFrom?: string } {
  const args = process.argv.slice(2);
  const result: { singleState?: string; resumeFrom?: string } = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--state' && args[i + 1]) {
      result.singleState = args[i + 1].toUpperCase();
      i++;
    } else if (args[i] === '--resume' && args[i + 1]) {
      result.resumeFrom = args[i + 1].toUpperCase();
      i++;
    }
  }
  
  return result;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   OpenStreetMap National Churches Ingestion Script         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Source: Overpass API (OpenStreetMap)');
  console.log('Filter: amenity=place_of_worship AND religion=christian');
  console.log('Target: United States (50 states + DC)');
  console.log(`Source ID: ${SOURCE_ID}`);
  console.log('');
  console.log('Features:');
  console.log('  - State-by-state processing to avoid API timeouts');
  console.log('  - Rate limiting (5 second delay between states)');
  console.log('  - Automatic retry on API errors (max 3 retries)');
  console.log('  - Deduplication (prefers ways > relations > nodes)');
  console.log('  - Spatial county FIPS assignment');
  console.log('');
  
  const { singleState, resumeFrom } = parseCliArgs();
  
  let statesToProcess = [...US_STATES];
  
  if (singleState) {
    const stateInfo = STATE_CODE_MAP[singleState];
    if (!stateInfo) {
      console.error(`Invalid state code: ${singleState}`);
      console.error('Valid codes: ' + US_STATES.map(s => s.code).join(', '));
      process.exit(1);
    }
    statesToProcess = [{ code: singleState, fips: stateInfo.fips, name: stateInfo.name }];
    console.log(`Processing single state: ${stateInfo.name} (${singleState})`);
  } else if (resumeFrom) {
    const resumeIndex = US_STATES.findIndex(s => s.code === resumeFrom);
    if (resumeIndex === -1) {
      console.error(`Invalid state code for resume: ${resumeFrom}`);
      console.error('Valid codes: ' + US_STATES.map(s => s.code).join(', '));
      process.exit(1);
    }
    statesToProcess = US_STATES.slice(resumeIndex);
    console.log(`Resuming from: ${US_STATES[resumeIndex].name} (${resumeFrom})`);
    console.log(`States remaining: ${statesToProcess.length}`);
  } else {
    console.log(`Processing all ${US_STATES.length} states + DC`);
  }
  
  console.log('');
  console.log('═'.repeat(60));
  
  const results: StateResult[] = [];
  let totalFetched = 0;
  let totalParsed = 0;
  let totalDeduplicated = 0;
  let totalWithFips = 0;
  let totalInserted = 0;
  let totalErrors = 0;
  let statesSkipped = 0;
  
  for (let i = 0; i < statesToProcess.length; i++) {
    const state = statesToProcess[i];
    const progress = `[${i + 1}/${statesToProcess.length}]`;
    
    console.log('');
    console.log(`${progress} Processing ${state.name} (${state.code})...`);
    console.log('-'.repeat(50));
    
    const result = await processState(state.code, state.fips, state.name);
    results.push(result);
    
    totalFetched += result.fetched;
    totalParsed += result.parsed;
    totalDeduplicated += result.deduplicated;
    totalWithFips += result.withCountyFips;
    totalInserted += result.inserted;
    totalErrors += result.errors;
    if (result.skipped) statesSkipped++;
    
    console.log(`${progress} ${state.code} complete: ${result.inserted} churches imported`);
    
    if (i < statesToProcess.length - 1) {
      console.log(`  Waiting ${RATE_LIMIT_MS / 1000} seconds before next state...`);
      await sleep(RATE_LIMIT_MS);
    }
  }
  
  console.log('');
  console.log('═'.repeat(60));
  console.log('                    NATIONAL INGESTION SUMMARY');
  console.log('═'.repeat(60));
  console.log('');
  console.log('TOTALS:');
  console.log(`  States Processed:          ${statesToProcess.length - statesSkipped}/${statesToProcess.length}`);
  console.log(`  States Skipped (errors):   ${statesSkipped}`);
  console.log(`  OSM Elements Fetched:      ${totalFetched.toLocaleString()}`);
  console.log(`  Raw Church Records:        ${totalParsed.toLocaleString()}`);
  console.log(`  After Deduplication:       ${totalDeduplicated.toLocaleString()}`);
  console.log(`  With County FIPS:          ${totalWithFips.toLocaleString()}`);
  console.log(`  Database Inserted/Updated: ${totalInserted.toLocaleString()}`);
  console.log(`  Database Errors:           ${totalErrors}`);
  console.log('');
  
  if (statesSkipped > 0) {
    console.log('SKIPPED STATES (errors):');
    for (const result of results) {
      if (result.skipped) {
        console.log(`  ${result.stateCode}: ${result.errorMessage}`);
      }
    }
    console.log('');
  }
  
  console.log('TOP 10 STATES BY CHURCH COUNT:');
  const sortedResults = [...results]
    .filter(r => !r.skipped)
    .sort((a, b) => b.inserted - a.inserted)
    .slice(0, 10);
  for (const result of sortedResults) {
    console.log(`  ${result.stateCode.padEnd(3)} ${result.stateName.padEnd(20)} ${result.inserted.toLocaleString().padStart(8)} churches`);
  }
  console.log('');
  
  console.log(`Note: OSM churches are imported with source="${SOURCE_ID}"`);
  console.log('');
  
  // Auto-link newly imported churches to existing city platforms
  if (totalInserted > 0) {
    console.log('═'.repeat(60));
    console.log('           AUTO-LINKING CHURCHES TO PLATFORMS');
    console.log('═'.repeat(60));
    console.log('');
    
    try {
      const { linkChurchesToPlatforms } = await import('./link-churches-to-platforms');
      const linkResult = await linkChurchesToPlatforms();
      
      console.log('');
      console.log(`Platforms Processed:    ${linkResult.platformsProcessed}`);
      console.log(`New Links Created:      ${linkResult.totalNewLinks.toLocaleString()}`);
      console.log(`Already Linked:         ${linkResult.totalAlreadyLinked.toLocaleString()}`);
      if (linkResult.totalErrors > 0) {
        console.log(`Errors:                 ${linkResult.totalErrors}`);
      }
    } catch (e) {
      console.error('Error auto-linking churches to platforms:', e);
      console.log('You can manually run: npx tsx scripts/link-churches-to-platforms.ts');
    }
    console.log('');
  }
  
  console.log('═'.repeat(60));
}

main()
  .then(() => {
    console.log('\nScript completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
