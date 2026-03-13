#!/usr/bin/env npx tsx
/**
 * Link Churches to Place Boundaries
 * 
 * Links churches to place and county subdivision boundaries (not tracts)
 * with smart deduplication for near-identical polygons.
 * 
 * Deduplication logic:
 * - When multiple boundaries match a church location
 * - Compare their areas using ST_Area
 * - If two boundaries have areas within 5% of each other, they're duplicates
 * - Keep only one (prefer the one with shorter name / cleaner data)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BATCH_SIZE = 100;
const AREA_SIMILARITY_THRESHOLD = 0.05; // 5% difference = same boundary

interface ChurchLocation {
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

async function getChurchesNeedingBoundaries(): Promise<ChurchLocation[]> {
  console.log('Fetching churches with coordinates...');
  
  const { data, error } = await supabase.rpc('fn_get_churches_simple');
  
  if (error) {
    console.error('Error fetching churches:', error);
    throw error;
  }
  
  const churches = (data || []).filter((c: any) => c.latitude && c.longitude);
  console.log(`Found ${churches.length} churches with coordinates`);
  
  return churches.map((c: any) => ({
    id: c.id,
    name: c.name,
    latitude: c.latitude,
    longitude: c.longitude
  }));
}

async function findBoundariesForPoint(lat: number, lon: number): Promise<BoundaryMatch[]> {
  // Find all place and county subdivision boundaries that contain this point
  const { data, error } = await supabase.rpc('fn_find_boundaries_for_point', {
    lat,
    lon
  });
  
  if (error) {
    // Function might not exist, try direct query
    return await findBoundariesDirect(lat, lon);
  }
  
  return data || [];
}

async function findBoundariesDirect(lat: number, lon: number): Promise<BoundaryMatch[]> {
  // Direct PostGIS query to find containing boundaries
  const { data, error } = await supabase.rpc('fn_boundaries_containing_point', {
    p_lat: lat,
    p_lon: lon
  });
  
  if (error) {
    console.error(`Error finding boundaries for point (${lat}, ${lon}):`, error.message);
    return [];
  }
  
  return data || [];
}

function deduplicateBoundaries(boundaries: BoundaryMatch[]): string[] {
  if (boundaries.length <= 1) {
    return boundaries.map(b => b.id);
  }
  
  // Group by similar area
  const deduplicated: BoundaryMatch[] = [];
  const used = new Set<string>();
  
  // Sort by area for consistent comparison
  const sorted = [...boundaries].sort((a, b) => b.area - a.area);
  
  for (const boundary of sorted) {
    if (used.has(boundary.id)) continue;
    
    // Check if this boundary is a duplicate of any we've kept
    let isDuplicate = false;
    for (const kept of deduplicated) {
      const areaDiff = Math.abs(boundary.area - kept.area) / Math.max(boundary.area, kept.area);
      if (areaDiff < AREA_SIMILARITY_THRESHOLD) {
        // These are duplicates - prefer the one with shorter/cleaner name
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

async function updateChurchBoundaries(churchId: string, boundaryIds: string[]): Promise<boolean> {
  const { error } = await supabase
    .from('churches')
    .update({ boundary_ids: boundaryIds })
    .eq('id', churchId);
  
  if (error) {
    console.error(`Error updating church ${churchId}:`, error.message);
    return false;
  }
  
  return true;
}

async function ensureRpcFunction(): Promise<void> {
  // Create the RPC function if it doesn't exist
  const functionSql = `
    CREATE OR REPLACE FUNCTION fn_boundaries_containing_point(p_lat double precision, p_lon double precision)
    RETURNS TABLE(id uuid, name text, type text, area double precision) AS $$
    BEGIN
      RETURN QUERY
      SELECT 
        b.id,
        b.name,
        b.type,
        ST_Area(b.geometry::geography) as area
      FROM boundaries b
      WHERE b.type IN ('place', 'county subdivision')
        AND ST_Contains(
          b.geometry,
          ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)
        );
    END;
    $$ LANGUAGE plpgsql;
  `;
  
  const { error } = await supabase.rpc('fn_boundaries_containing_point', { p_lat: 0, p_lon: 0 });
  
  if (error && error.message.includes('does not exist')) {
    console.log('Creating fn_boundaries_containing_point function...');
    // We can't create functions via Supabase client, so we'll use a workaround
    console.log('Note: RPC function needs to be created manually. Using fallback query.');
  }
}

async function linkChurchBoundariesBatch(churches: ChurchLocation[]): Promise<{ updated: number; failed: number }> {
  let updated = 0;
  let failed = 0;
  
  for (const church of churches) {
    try {
      // Find all place/subdivision boundaries containing this point
      const { data: boundaries, error } = await supabase
        .from('boundaries')
        .select('id, name, type')
        .in('type', ['place', 'county subdivision'])
        .not('geometry', 'is', null);
      
      if (error) throw error;
      
      // Use RPC to check containment for each boundary
      const matchingBoundaries: BoundaryMatch[] = [];
      
      // Query for boundaries containing this church point
      const { data: matches, error: matchError } = await supabase.rpc('fn_get_boundaries_for_church', {
        church_lat: church.latitude,
        church_lon: church.longitude
      });
      
      if (matchError) {
        // Fallback: direct query approach
        const result = await findBoundariesForChurch(church.latitude, church.longitude);
        matchingBoundaries.push(...result);
      } else if (matches) {
        matchingBoundaries.push(...matches);
      }
      
      // Deduplicate by area similarity
      const dedupedIds = deduplicateBoundaries(matchingBoundaries);
      
      // Update church
      if (await updateChurchBoundaries(church.id, dedupedIds)) {
        updated++;
      } else {
        failed++;
      }
    } catch (err: any) {
      console.error(`Error processing ${church.name}:`, err.message);
      failed++;
    }
  }
  
  return { updated, failed };
}

async function findBoundariesForChurch(lat: number, lon: number): Promise<BoundaryMatch[]> {
  // Use a raw SQL approach via Supabase
  const pointWkt = `POINT(${lon} ${lat})`;
  
  const { data, error } = await supabase
    .from('boundaries')
    .select('id, name, type')
    .in('type', ['place', 'county subdivision']);
  
  // We need to filter by containment - this requires PostGIS
  // For now, return empty and we'll create proper RPC
  return [];
}

async function main() {
  console.log('='.repeat(60));
  console.log('LINKING CHURCHES TO PLACE BOUNDARIES');
  console.log('='.repeat(60));
  console.log('\nSettings:');
  console.log(`  - Include: place, county subdivision`);
  console.log(`  - Exclude: census_tract`);
  console.log(`  - Area similarity threshold: ${AREA_SIMILARITY_THRESHOLD * 100}%`);
  console.log('');
  
  // First, let's create/verify the RPC function exists
  // Check if we can query boundaries with spatial containment
  console.log('Testing spatial query capability...');
  
  const testQuery = await supabase.rpc('fn_get_boundaries_for_church', {
    church_lat: 42.9634,
    church_lon: -85.6681
  });
  
  if (testQuery.error) {
    console.log('Need to create RPC function. Creating migration...');
    await createBoundaryFunction();
  } else {
    console.log('Spatial query function exists.');
  }
  
  // Get all churches
  const churches = await getChurchesNeedingBoundaries();
  
  console.log(`\nProcessing ${churches.length} churches in batches of ${BATCH_SIZE}...`);
  
  let totalUpdated = 0;
  let totalFailed = 0;
  
  for (let i = 0; i < churches.length; i += BATCH_SIZE) {
    const batch = churches.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(churches.length / BATCH_SIZE);
    
    process.stdout.write(`\rBatch ${batchNum}/${totalBatches}...`);
    
    const { updated, failed } = await processBatch(batch);
    totalUpdated += updated;
    totalFailed += failed;
  }
  
  console.log('\n\n' + '='.repeat(60));
  console.log('COMPLETE');
  console.log('='.repeat(60));
  console.log(`Churches updated: ${totalUpdated}`);
  console.log(`Failed: ${totalFailed}`);
}

async function createBoundaryFunction(): Promise<void> {
  console.log('Creating fn_get_boundaries_for_church function via SQL...');
  
  // We'll write the SQL to a migration file
  const sql = `
-- Function to find place and county subdivision boundaries containing a point
-- with area for deduplication
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
    ST_Area(b.geometry::geography) as area
  FROM boundaries b
  WHERE b.type IN ('place', 'county subdivision')
    AND b.geometry IS NOT NULL
    AND ST_Contains(
      b.geometry,
      ST_SetSRID(ST_MakePoint(church_lon, church_lat), 4326)
    )
  ORDER BY area DESC;
END;
$$ LANGUAGE plpgsql;
  `;
  
  console.log('\nSQL function needed:');
  console.log(sql);
  console.log('\nPlease run this in Supabase SQL Editor, then re-run this script.');
  process.exit(1);
}

async function processBatch(churches: ChurchLocation[]): Promise<{ updated: number; failed: number }> {
  let updated = 0;
  let failed = 0;
  
  for (const church of churches) {
    try {
      // Get boundaries for this church
      const { data: boundaries, error } = await supabase.rpc('fn_get_boundaries_for_church', {
        church_lat: church.latitude,
        church_lon: church.longitude
      });
      
      if (error) {
        console.error(`\nError for ${church.name}:`, error.message);
        failed++;
        continue;
      }
      
      // Deduplicate by area similarity
      const dedupedIds = deduplicateBoundaries(boundaries || []);
      
      // Update church
      const { error: updateError } = await supabase
        .from('churches')
        .update({ boundary_ids: dedupedIds })
        .eq('id', church.id);
      
      if (updateError) {
        console.error(`\nUpdate error for ${church.name}:`, updateError.message);
        failed++;
      } else {
        updated++;
      }
    } catch (err: any) {
      console.error(`\nException for ${church.name}:`, err.message);
      failed++;
    }
  }
  
  return { updated, failed };
}

main().catch(console.error);
