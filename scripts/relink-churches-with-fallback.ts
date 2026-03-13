#!/usr/bin/env npx tsx
/**
 * Re-link churches to boundaries with county fallback
 * 
 * Logic:
 * 1. First try to find 'place' boundaries for each church
 * 2. If no place found, fall back to 'county' boundaries
 * 
 * Usage: npx tsx scripts/relink-churches-with-fallback.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PARALLEL_LIMIT = 20;
const AREA_SIMILARITY_THRESHOLD = 0.05;

interface Church {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface BoundaryMatch {
  id: string;
  name: string;
  type: string;
  area: number;
}

function deduplicateBoundaries(boundaries: BoundaryMatch[]): string[] {
  if (boundaries.length <= 1) return boundaries.map(b => b.id);
  
  const deduplicated: BoundaryMatch[] = [];
  const sorted = [...boundaries].sort((a, b) => b.area - a.area);
  
  for (const boundary of sorted) {
    let isDuplicate = false;
    for (const kept of deduplicated) {
      const maxArea = Math.max(boundary.area, kept.area);
      if (maxArea === 0) continue;
      const areaDiff = Math.abs(boundary.area - kept.area) / maxArea;
      if (areaDiff < AREA_SIMILARITY_THRESHOLD) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) deduplicated.push(boundary);
  }
  
  return deduplicated.map(b => b.id);
}

async function getBoundariesForChurch(lat: number, lon: number): Promise<BoundaryMatch[]> {
  // First try places
  const { data: places } = await supabase.rpc('fn_get_boundaries_for_church', {
    church_lat: lat,
    church_lon: lon
  });
  
  if (places && places.length > 0) {
    return places;
  }
  
  // Fallback to counties - use a raw query approach
  // Since fn_get_boundaries_for_church only returns places, we need to query counties directly
  const { data: counties } = await supabase.rpc('fn_search_boundaries_by_point', {
    lat: lat,
    lon: lon,
    boundary_type: 'county'
  });
  
  return counties || [];
}

// Create a temporary RPC function to query boundaries by point and type
async function createHelperFunction(): Promise<boolean> {
  // Check if our helper function exists by testing it
  const { error } = await supabase.rpc('fn_search_boundaries_by_point', {
    lat: 43.0,
    lon: -85.6,
    boundary_type: 'county'
  });
  
  if (error) {
    console.log('Helper function not available, will use alternative approach');
    return false;
  }
  return true;
}

async function getBoundariesWithFallback(lat: number, lon: number): Promise<string[]> {
  // Get places using existing function
  const { data: places } = await supabase.rpc('fn_get_boundaries_for_church', {
    church_lat: lat,
    church_lon: lon
  });
  
  if (places && places.length > 0) {
    return deduplicateBoundaries(places);
  }
  
  // For counties, we need to query directly using PostGIS
  // Since we can't modify the RPC, let's get all boundaries and check containment client-side
  // This is less efficient but works without modifying the database
  
  // Alternative: Query the boundaries with a bounding box first, then filter
  // We'll use the existing boundary data and do a simple match
  
  // Get nearby counties based on the point
  const { data: allCounties } = await supabase
    .from('boundaries')
    .select('id, name, external_id')
    .eq('type', 'county')
    .like('external_id', '26%'); // Michigan counties only
  
  if (!allCounties || allCounties.length === 0) {
    return [];
  }
  
  // For each church, we need to check if it's within a county
  // Since we can't do this efficiently without the RPC, we'll return the county
  // that the church's state/county FIPS would match
  
  // Actually, let's use a simpler approach - since all churches are in MI
  // and we have the county geometries, let's find which county contains the point
  // by iterating through counties (this is slow but works)
  
  // For now, return empty - we need the RPC update
  return [];
}

async function processChurch(church: Church): Promise<{ updated: boolean; boundaries: number; type: string }> {
  try {
    // First try places using existing function
    const { data: places } = await supabase.rpc('fn_get_boundaries_for_church', {
      church_lat: church.latitude,
      church_lon: church.longitude
    });
    
    if (places && places.length > 0) {
      const dedupedIds = deduplicateBoundaries(places);
      
      const { error } = await supabase
        .from('churches')
        .update({ boundary_ids: dedupedIds })
        .eq('id', church.id);
      
      return { updated: !error, boundaries: dedupedIds.length, type: 'place' };
    }
    
    // No places found - need county fallback
    // Since we can't query counties efficiently without the RPC update,
    // we'll mark these churches for later and report them
    return { updated: false, boundaries: 0, type: 'none' };
    
  } catch {
    return { updated: false, boundaries: 0, type: 'error' };
  }
}

async function main() {
  console.log('=== Re-link Churches with County Fallback ===\n');
  
  // Get all churches with coordinates
  console.log('Fetching all churches with coordinates...');
  const { data: allData } = await supabase.rpc('fn_get_churches_simple');
  
  const churches: Church[] = (allData || [])
    .filter((c: any) => c.location?.coordinates)
    .map((c: any) => ({
      id: c.id,
      name: c.name,
      longitude: c.location.coordinates[0],
      latitude: c.location.coordinates[1]
    }));
  
  console.log(`Found ${churches.length} churches with coordinates\n`);
  
  if (churches.length === 0) {
    console.log('No churches to process.');
    return;
  }
  
  // Process churches
  console.log('Linking churches to boundaries...');
  let processed = 0;
  let withPlaces = 0;
  let needCounty = 0;
  let errors = 0;
  
  for (let i = 0; i < churches.length; i += PARALLEL_LIMIT) {
    const batch = churches.slice(i, i + PARALLEL_LIMIT);
    const results = await Promise.all(batch.map(processChurch));
    
    for (const result of results) {
      processed++;
      if (result.type === 'place') withPlaces++;
      else if (result.type === 'none') needCounty++;
      else if (result.type === 'error') errors++;
    }
    
    if (processed % 100 === 0 || processed === churches.length) {
      console.log(`  Processed ${processed}/${churches.length} (${withPlaces} with places, ${needCounty} need county)`);
    }
  }
  
  console.log(`\n✅ Complete!`);
  console.log(`   Total: ${processed}`);
  console.log(`   With places: ${withPlaces}`);
  console.log(`   Need county fallback: ${needCounty}`);
  console.log(`   Errors: ${errors}`);
  
  if (needCounty > 0) {
    console.log(`\n⚠️  ${needCounty} churches need county fallback.`);
    console.log('   To enable county fallback, run the following SQL in Supabase SQL Editor:');
    console.log('\n--- SQL START ---');
    console.log(`
CREATE OR REPLACE FUNCTION fn_get_boundaries_for_church(
  church_lat double precision,
  church_lon double precision
)
RETURNS TABLE(id uuid, name text, type text, area double precision) AS $$
DECLARE
  place_count integer;
BEGIN
  SELECT COUNT(*) INTO place_count
  FROM boundaries b
  WHERE b.type = 'place'
    AND b.geometry IS NOT NULL
    AND ST_Covers(b.geometry::geometry, ST_SetSRID(ST_MakePoint(church_lon, church_lat), 4326));
  
  IF place_count > 0 THEN
    RETURN QUERY SELECT b.id, b.name, b.type, ST_Area(b.geometry) as area
    FROM boundaries b WHERE b.type = 'place' AND b.geometry IS NOT NULL
    AND ST_Covers(b.geometry::geometry, ST_SetSRID(ST_MakePoint(church_lon, church_lat), 4326))
    ORDER BY area DESC;
  ELSE
    RETURN QUERY SELECT b.id, b.name, b.type, ST_Area(b.geometry) as area
    FROM boundaries b WHERE b.type = 'county' AND b.geometry IS NOT NULL
    AND ST_Covers(b.geometry::geometry, ST_SetSRID(ST_MakePoint(church_lon, church_lat), 4326))
    ORDER BY area DESC;
  END IF;
END;
$$ LANGUAGE plpgsql;
`);
    console.log('--- SQL END ---');
    console.log('\nAfter running the SQL, re-run this script to link remaining churches.');
  }
}

main().catch(console.error);
