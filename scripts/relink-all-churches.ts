#!/usr/bin/env npx tsx
/**
 * Re-link ALL churches to place boundaries
 * 
 * After cleaning up county subdivisions and duplicates, this script:
 * 1. Clears all existing boundary_ids from churches
 * 2. Re-links each church to 'place' boundaries only
 * 
 * Usage: npx tsx scripts/relink-all-churches.ts
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

async function processChurch(church: Church): Promise<{ updated: boolean; boundaries: number }> {
  try {
    const { data: boundaries } = await supabase.rpc('fn_get_boundaries_for_church', {
      church_lat: church.latitude,
      church_lon: church.longitude
    });
    
    const dedupedIds = deduplicateBoundaries(boundaries || []);
    
    const { error } = await supabase
      .from('churches')
      .update({ boundary_ids: dedupedIds })
      .eq('id', church.id);
    
    return { updated: !error, boundaries: dedupedIds.length };
  } catch {
    return { updated: false, boundaries: 0 };
  }
}

async function main() {
  console.log('=== Re-link All Churches to Place Boundaries ===\n');
  
  // Step 1: Get all churches with coordinates
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
  
  // Step 2: Clear all existing boundary_ids
  console.log('Clearing existing boundary_ids...');
  const { error: clearError } = await supabase
    .from('churches')
    .update({ boundary_ids: [] })
    .not('id', 'is', null);
  
  if (clearError) {
    console.error('Error clearing boundaries:', clearError);
    return;
  }
  console.log('Cleared all boundary_ids\n');
  
  // Step 3: Re-link in parallel batches
  console.log('Re-linking churches to place boundaries...');
  let processed = 0;
  let updated = 0;
  let withBoundaries = 0;
  
  for (let i = 0; i < churches.length; i += PARALLEL_LIMIT) {
    const batch = churches.slice(i, i + PARALLEL_LIMIT);
    const results = await Promise.all(batch.map(processChurch));
    
    for (const result of results) {
      processed++;
      if (result.updated) updated++;
      if (result.boundaries > 0) withBoundaries++;
    }
    
    if (processed % 100 === 0 || processed === churches.length) {
      console.log(`  Processed ${processed}/${churches.length} (${withBoundaries} have boundaries)`);
    }
  }
  
  console.log(`\n✅ Complete!`);
  console.log(`   Total: ${processed}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   With boundaries: ${withBoundaries}`);
}

main().catch(console.error);
