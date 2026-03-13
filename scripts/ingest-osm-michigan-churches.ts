#!/usr/bin/env npx tsx
/**
 * OpenStreetMap Michigan Churches Ingestion Script
 * 
 * Fetches all Christian churches in Michigan from the Overpass API
 * and imports them into the churches table with proper source tracking.
 * 
 * Churches are tagged with county_fips for region-based filtering,
 * allowing admins to enable/disable OSM churches by county.
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
 * Usage: npx tsx scripts/ingest-osm-michigan-churches.ts
 * 
 * Source: Overpass API (OpenStreetMap)
 * Filters: amenity=place_of_worship AND religion=christian in Michigan
 */

import { createClient } from '@supabase/supabase-js';

// Overpass API URL for Michigan Christian churches
// This URL is URL-encoded and fetches nodes, ways, and relations
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter?data=%5Bout%3Ajson%5D%5Btimeout%3A900%5D%3B%0A%0A%2F%2F%20Michigan%20by%20ISO%20code%0Aarea%5B%22ISO3166-2%22%3D%22US-MI%22%5D%5Badmin_level%3D4%5D-%3E.michigan%3B%0A%0A%2F%2F%20All%20Christian%20churches%20%28nodes%2C%20ways%2C%20relations%29%20in%20Michigan%0A%28%0A%20%20node%5B%22amenity%22%3D%22place_of_worship%22%5D%5B%22religion%22%3D%22christian%22%5D%28area.michigan%29%3B%0A%20%20way%5B%22amenity%22%3D%22place_of_worship%22%5D%5B%22religion%22%3D%22christian%22%5D%28area.michigan%29%3B%0A%20%20relation%5B%22amenity%22%3D%22place_of_worship%22%5D%5B%22religion%22%3D%22christian%22%5D%28area.michigan%29%3B%0A%29%3B%0A%0Aout%20center%3B';

const MICHIGAN_FIPS = '26';
const SOURCE_ID = 'osm_mi_church';

// Deduplication: max distance in meters for two entries to be considered duplicates
const DEDUP_DISTANCE_METERS = 50;

// Supabase setup
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
  elementPriority: number; // way=3, relation=2, node=1
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchOverpassData(): Promise<OSMElement[]> {
  console.log('\nFetching churches from Overpass API...');
  console.log('This may take a few minutes due to the large query area.\n');
  
  try {
    const response = await fetch(OVERPASS_URL, {
      headers: {
        'User-Agent': 'kingdom-map-osm-import/1.0 (github.com/kingdom-map)',
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Overpass API error: ${response.status} - ${errorText.substring(0, 500)}`);
      throw new Error(`Overpass API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.elements || !Array.isArray(data.elements)) {
      throw new Error('Invalid Overpass response: no elements array');
    }
    
    console.log(`Fetched ${data.elements.length} elements from Overpass API`);
    return data.elements;
    
  } catch (error: any) {
    console.error('Failed to fetch from Overpass API:', error.message);
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
  // Ways (building outlines) > Relations > Nodes (just points)
  switch (type) {
    case 'way': return 3;
    case 'relation': return 2;
    case 'node': return 1;
    default: return 0;
  }
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
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

function parseOSMElements(elements: OSMElement[]): ChurchRecord[] {
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
      continue; // Skip unnamed places of worship
    }
    
    rawChurches.push({
      name: name,
      address: buildAddress(tags),
      city: tags['addr:city'] || null,
      state: tags['addr:state'] || 'MI',
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
  
  console.log(`Parsed ${rawChurches.length} raw church records (skipped ${skipped} without name/coordinates)`);
  return rawChurches;
}

function deduplicateChurches(churches: ChurchRecord[]): ChurchRecord[] {
  console.log('\nDeduplicating churches...');
  
  // Sort by priority (ways first) so we keep the best version
  const sorted = [...churches].sort((a, b) => b.elementPriority - a.elementPriority);
  
  const kept: ChurchRecord[] = [];
  const skippedDupes = new Set<string>();
  
  for (const church of sorted) {
    if (skippedDupes.has(church.external_id)) {
      continue;
    }
    
    // Check if this church is a duplicate of something already kept
    let isDuplicate = false;
    
    for (const existing of kept) {
      const distance = haversineDistance(
        church.latitude, church.longitude,
        existing.latitude, existing.longitude
      );
      
      if (distance <= DEDUP_DISTANCE_METERS) {
        // Check name similarity
        const nameA = normalizeName(church.name);
        const nameB = normalizeName(existing.name);
        
        // Consider duplicate if names are very similar or one contains the other
        if (nameA === nameB || nameA.includes(nameB) || nameB.includes(nameA) || 
            (nameA.length > 3 && nameB.length > 3 && (
              nameA.substring(0, 5) === nameB.substring(0, 5) ||
              nameA.includes(nameB.substring(0, 5)) ||
              nameB.includes(nameA.substring(0, 5))
            ))) {
          isDuplicate = true;
          
          // If the new one has more info (e.g. address), merge it
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
  
  console.log(`  Deduplicated: ${churches.length} -> ${kept.length} (removed ${churches.length - kept.length} duplicates)`);
  return kept;
}

async function assignCountyFipsViaSpatialJoin(churches: ChurchRecord[]): Promise<void> {
  console.log('\nAssigning county FIPS via spatial join with boundaries...');
  
  let assigned = 0;
  let failed = 0;
  
  // Process in parallel batches for speed
  const batchSize = 50;
  const concurrency = 10; // Process 10 churches concurrently
  
  for (let i = 0; i < churches.length; i += batchSize) {
    const batch = churches.slice(i, i + batchSize);
    
    // Process batch in parallel
    const promises = batch.map(async (church) => {
      // Try tract-based county lookup first
      let { data, error } = await supabase.rpc('find_county_from_tract', {
        lng: church.longitude,
        lat: church.latitude
      });
      
      // Fallback to county-based lookup
      if (!data && !error) {
        const countyResult = await supabase.rpc('find_county_for_point', {
          lng: church.longitude,
          lat: church.latitude,
          state_fips: MICHIGAN_FIPS
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
    
    const results = await Promise.all(promises);
    assigned += results.filter(r => r).length;
    failed += results.filter(r => !r).length;
    
    process.stdout.write(`\r  Progress: ${Math.min(i + batchSize, churches.length)}/${churches.length} (${assigned} assigned, ${failed} pending)`);
  }
  
  console.log('');
  
  const finalAssigned = churches.filter(c => c.county_fips).length;
  console.log(`  Assigned: ${assigned}, Failed RPC: ${failed}`);
  console.log(`  Final: ${finalAssigned}/${churches.length} churches have county FIPS assigned`);
}

function reportOrphanedChurches(churches: ChurchRecord[]): { valid: ChurchRecord[]; orphaned: ChurchRecord[] } {
  // Separate churches with and without county_fips
  const valid = churches.filter(c => c.county_fips !== null);
  const orphaned = churches.filter(c => c.county_fips === null);
  
  if (orphaned.length > 0) {
    console.log('\n' + '!'.repeat(60));
    console.log('WARNING: County boundaries not found for some churches!');
    console.log('!'.repeat(60));
    console.log(`  Churches with valid county FIPS: ${valid.length}`);
    console.log(`  Churches WITHOUT county FIPS (will be SKIPPED): ${orphaned.length}`);
    console.log('');
    console.log('This typically means county boundaries have not been imported yet.');
    console.log('Please run the following command first:');
    console.log('  npx tsx scripts/ingest-tigerweb-boundaries.ts');
    console.log('');
    console.log('Then re-run this script to import all churches.');
    console.log('!'.repeat(60));
  }
  
  return { valid, orphaned };
}

async function upsertChurches(churches: ChurchRecord[]): Promise<{ inserted: number; updated: number; errors: number }> {
  console.log('\nUpserting churches to database...');
  
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  
  const batchSize = 50;
  
  for (let i = 0; i < churches.length; i += batchSize) {
    const batch = churches.slice(i, i + batchSize);
    
    // Convert to database format (omit internal fields)
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
      // Convert to PostGIS geography point
      location: `SRID=4326;POINT(${church.longitude} ${church.latitude})`,
      source: church.source,
      external_id: church.external_id,
      county_fips: church.county_fips,
      approved: true, // Auto-approve OSM imports
      collaboration_have: [],
      collaboration_need: [],
      boundary_ids: [],
      prayer_auto_approve: true,
      prayer_name_display_mode: 'first_name_last_initial',
    }));
    
    // Use upsert with conflict handling on (source, external_id)
    const { data, error } = await supabase
      .from('churches')
      .upsert(dbRecords, {
        onConflict: 'source,external_id',
        ignoreDuplicates: false,
      })
      .select('id');
    
    if (error) {
      console.error(`  Batch error:`, error.message);
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
    
    process.stdout.write(`\r  Progress: ${Math.min(i + batchSize, churches.length)}/${churches.length}`);
    
    await sleep(50);
  }
  
  console.log('');
  return { inserted, updated, errors };
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     OpenStreetMap Michigan Churches Ingestion Script       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Source: Overpass API (OpenStreetMap)');
  console.log('Filter: amenity=place_of_worship AND religion=christian');
  console.log('Target: Michigan (ISO 3166-2: US-MI)');
  console.log('');
  console.log('Features:');
  console.log('  - Deduplication (prefers ways > relations > nodes)');
  console.log('  - Spatial county FIPS assignment (via DB boundaries)');
  console.log('  - Upsert support (source, external_id unique constraint)');
  console.log('');
  
  // Step 1: Fetch from Overpass API
  console.log('STEP 1: Fetching from Overpass API...');
  const elements = await fetchOverpassData();
  
  // Count element types
  const typeCounts = elements.reduce((acc, el) => {
    acc[el.type] = (acc[el.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log(`  Element types: ${JSON.stringify(typeCounts)}`);
  
  // Step 2: Parse elements into church records
  console.log('\nSTEP 2: Parsing OSM elements...');
  const rawChurches = parseOSMElements(elements);
  
  // Step 3: Deduplicate (prefer ways/relations over nodes for same location)
  console.log('\nSTEP 3: Deduplicating churches...');
  const churches = deduplicateChurches(rawChurches);
  
  // Count denominations
  const denomCounts: Record<string, number> = {};
  for (const church of churches) {
    const denom = church.denomination || 'unspecified';
    denomCounts[denom] = (denomCounts[denom] || 0) + 1;
  }
  const topDenoms = Object.entries(denomCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  console.log('\n  Top denominations:');
  for (const [denom, count] of topDenoms) {
    console.log(`    ${denom}: ${count}`);
  }
  
  // Step 4: Assign county FIPS codes via spatial join
  console.log('\nSTEP 4: Assigning county FIPS codes...');
  await assignCountyFipsViaSpatialJoin(churches);
  
  // Step 5: Filter out churches without county FIPS (can't be region-filtered)
  console.log('\nSTEP 5: Validating county assignments...');
  const { valid: churchesToInsert, orphaned } = reportOrphanedChurches(churches);
  
  // Count by county (only for valid churches)
  const countyCounts: Record<string, number> = {};
  for (const church of churchesToInsert) {
    const county = church.county_fips || 'unknown';
    countyCounts[county] = (countyCounts[county] || 0) + 1;
  }
  console.log('\n  Churches per county (top 10):');
  const topCounties = Object.entries(countyCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [county, count] of topCounties) {
    console.log(`    ${county}: ${count}`);
  }
  
  // Step 6: Upsert to database (only churches with valid county FIPS)
  console.log('\nSTEP 6: Upserting to database...');
  let result = { inserted: 0, updated: 0, errors: 0 };
  
  if (churchesToInsert.length > 0) {
    result = await upsertChurches(churchesToInsert);
  } else {
    console.log('  No churches to insert (all missing county FIPS).');
    console.log('  Please import boundaries first and re-run this script.');
  }
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('                    INGESTION SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  OSM Elements Fetched:      ${elements.length}`);
  console.log(`  Raw Church Records:        ${rawChurches.length}`);
  console.log(`  After Deduplication:       ${churches.length}`);
  console.log(`  Duplicates Removed:        ${rawChurches.length - churches.length}`);
  console.log(`  With County FIPS:          ${churchesToInsert.length}`);
  console.log(`  Without County (SKIPPED):  ${orphaned.length}`);
  console.log(`  Unique Counties:           ${Object.keys(countyCounts).length}`);
  console.log(`  Database Inserted/Updated: ${result.inserted}`);
  console.log(`  Database Errors:           ${result.errors}`);
  console.log('');
  if (orphaned.length > 0) {
    console.log('IMPORTANT: Some churches were skipped due to missing boundaries.');
    console.log('To import all churches, run these commands in order:');
    console.log('  1. npx tsx scripts/ingest-tigerweb-boundaries.ts');
    console.log('  2. npx tsx scripts/ingest-osm-michigan-churches.ts');
    console.log('');
  }
  console.log('Note: OSM churches are imported with source="osm_mi_church"');
  console.log('');
  
  // Auto-link newly imported churches to existing city platforms
  if (result.inserted > 0) {
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

// Run
main()
  .then(() => {
    console.log('\nScript completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
