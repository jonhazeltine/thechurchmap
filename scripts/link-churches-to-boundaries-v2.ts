#!/usr/bin/env npx tsx
/**
 * Link Churches to Place Boundaries
 * 
 * Uses fn_get_boundaries_for_church RPC to find place and county subdivision
 * boundaries for each church, with area-based deduplication.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BATCH_SIZE = 50;
const AREA_SIMILARITY_THRESHOLD = 0.05; // 5% difference = same boundary

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
  if (boundaries.length <= 1) {
    return boundaries.map(b => b.id);
  }
  
  const deduplicated: BoundaryMatch[] = [];
  const used = new Set<string>();
  
  // Sort by area descending
  const sorted = [...boundaries].sort((a, b) => b.area - a.area);
  
  for (const boundary of sorted) {
    if (used.has(boundary.id)) continue;
    
    let isDuplicate = false;
    for (const kept of deduplicated) {
      // Compare areas - if within threshold, treat as duplicate
      const maxArea = Math.max(boundary.area, kept.area);
      const minArea = Math.min(boundary.area, kept.area);
      if (maxArea === 0) continue;
      
      const areaDiff = (maxArea - minArea) / maxArea;
      
      if (areaDiff < AREA_SIMILARITY_THRESHOLD) {
        // These are duplicates - keep the one already added (larger area / first)
        isDuplicate = true;
        used.add(boundary.id);
        break;
      }
    }
    
    if (!isDuplicate) {
      deduplicated.push(boundary);
      used.add(boundary.id);
    }
  }
  
  return deduplicated.map(b => b.id);
}

async function getChurches(): Promise<Church[]> {
  console.log('Fetching churches...');
  
  const { data, error } = await supabase.rpc('fn_get_churches_simple');
  
  if (error) {
    console.error('Error:', error);
    throw error;
  }
  
  const churches = (data || [])
    .filter((c: any) => c.location?.coordinates)
    .map((c: any) => ({
      id: c.id,
      name: c.name,
      longitude: c.location.coordinates[0],
      latitude: c.location.coordinates[1]
    }));
  
  console.log(`Found ${churches.length} churches with coordinates`);
  return churches;
}

async function findBoundariesForChurch(church: Church): Promise<BoundaryMatch[]> {
  const { data, error } = await supabase.rpc('fn_get_boundaries_for_church', {
    church_lat: church.latitude,
    church_lon: church.longitude
  });
  
  if (error) {
    console.error(`RPC error for ${church.name}:`, error.message);
    return [];
  }
  
  return data || [];
}

async function updateChurch(churchId: string, boundaryIds: string[]): Promise<boolean> {
  const { error } = await supabase
    .from('churches')
    .update({ boundary_ids: boundaryIds })
    .eq('id', churchId);
  
  return !error;
}

async function testRpcFunction(): Promise<boolean> {
  console.log('Testing RPC function with Grand Rapids coords...');
  
  const { data, error } = await supabase.rpc('fn_get_boundaries_for_church', {
    church_lat: 42.9634,
    church_lon: -85.6681
  });
  
  if (error) {
    console.error('RPC function not found:', error.message);
    console.log('\n' + '='.repeat(70));
    console.log('PLEASE RUN THIS SQL IN SUPABASE SQL EDITOR:');
    console.log('='.repeat(70));
    console.log(`
CREATE OR REPLACE FUNCTION fn_get_boundaries_for_church(
  church_lat double precision,
  church_lon double precision
)
RETURNS TABLE(id uuid, name text, type text, area double precision) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.type,
    ST_Area(b.geometry) as area
  FROM boundaries b
  WHERE b.type IN ('place', 'county subdivision')
    AND b.geometry IS NOT NULL
    AND ST_Covers(
      b.geometry,
      ST_SetSRID(ST_MakePoint(church_lon, church_lat), 4326)::geography
    )
  ORDER BY area DESC;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION fn_get_boundaries_for_church(double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_get_boundaries_for_church(double precision, double precision) TO anon;
GRANT EXECUTE ON FUNCTION fn_get_boundaries_for_church(double precision, double precision) TO service_role;
    `);
    console.log('='.repeat(70));
    return false;
  }
  
  console.log(`Function works! Found ${data?.length || 0} boundaries for test point:`);
  data?.forEach((b: BoundaryMatch) => {
    console.log(`  - ${b.type}: ${b.name} (area: ${Math.round(b.area / 1000000)} sq km)`);
  });
  
  return true;
}

async function main() {
  console.log('='.repeat(60));
  console.log('LINKING CHURCHES TO PLACE BOUNDARIES');
  console.log('='.repeat(60));
  console.log(`\nSettings:`);
  console.log(`  - Include: place, county subdivision`);
  console.log(`  - Exclude: census_tract`);
  console.log(`  - Area similarity threshold: ${AREA_SIMILARITY_THRESHOLD * 100}%`);
  console.log('');
  
  // Test RPC function exists
  const functionExists = await testRpcFunction();
  if (!functionExists) {
    console.log('\nPlease create the function first, then re-run this script.');
    process.exit(1);
  }
  
  // Get all churches
  const churches = await getChurches();
  
  console.log(`\nProcessing ${churches.length} churches...`);
  
  let updated = 0;
  let failed = 0;
  let noBoundaries = 0;
  
  const startTime = Date.now();
  
  for (let i = 0; i < churches.length; i++) {
    const church = churches[i];
    
    if (i % 100 === 0 && i > 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = i / elapsed;
      const remaining = (churches.length - i) / rate;
      console.log(`Progress: ${i}/${churches.length} (${Math.round(i/churches.length*100)}%) - ETA: ${Math.round(remaining)}s`);
    }
    
    try {
      const boundaries = await findBoundariesForChurch(church);
      
      if (boundaries.length === 0) {
        noBoundaries++;
        // Still update to empty array to clear any stale data
        await updateChurch(church.id, []);
        continue;
      }
      
      const dedupedIds = deduplicateBoundaries(boundaries);
      
      if (await updateChurch(church.id, dedupedIds)) {
        updated++;
      } else {
        failed++;
      }
    } catch (err: any) {
      console.error(`Error for ${church.name}:`, err.message);
      failed++;
    }
  }
  
  const totalTime = Math.round((Date.now() - startTime) / 1000);
  
  console.log('\n' + '='.repeat(60));
  console.log('COMPLETE');
  console.log('='.repeat(60));
  console.log(`Updated with boundaries: ${updated}`);
  console.log(`No boundaries found: ${noBoundaries}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total time: ${totalTime}s`);
}

main().catch(console.error);
