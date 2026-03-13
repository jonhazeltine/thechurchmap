#!/usr/bin/env npx tsx
/**
 * Fast parallel boundary linking for remaining churches
 * 
 * IMPORTANT: See docs/DATA_INGESTION_GUIDE.md for data ingestion rules.
 * 
 * This script links churches to 'place' boundaries ONLY.
 * It uses fn_get_boundaries_for_church RPC which:
 * - INCLUDES: 'place' boundaries (cities, villages, CDPs)
 * - EXCLUDES: 'census_tract' (too granular, only for health overlay)
 * - EXCLUDES: 'county_subdivision' (duplicates places)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PARALLEL_LIMIT = 20; // Process 20 churches at a time
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
  console.log('Fetching churches without boundaries...');
  
  // Get churches that need boundaries (empty boundary_ids)
  const { data: allData } = await supabase.rpc('fn_get_churches_simple');
  
  const churches: Church[] = (allData || [])
    .filter((c: any) => c.location?.coordinates && (!c.boundary_ids || c.boundary_ids.length === 0))
    .map((c: any) => ({
      id: c.id,
      name: c.name,
      longitude: c.location.coordinates[0],
      latitude: c.location.coordinates[1]
    }));
  
  console.log(`Found ${churches.length} churches needing boundaries`);
  
  if (churches.length === 0) {
    console.log('All done!');
    return;
  }
  
  let processed = 0;
  let updated = 0;
  let withBoundaries = 0;
  const startTime = Date.now();
  
  // Process in parallel batches
  for (let i = 0; i < churches.length; i += PARALLEL_LIMIT) {
    const batch = churches.slice(i, i + PARALLEL_LIMIT);
    
    const results = await Promise.all(batch.map(c => processChurch(c)));
    
    results.forEach(r => {
      processed++;
      if (r.updated) updated++;
      if (r.boundaries > 0) withBoundaries++;
    });
    
    if (processed % 100 === 0 || processed === churches.length) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const remaining = (churches.length - processed) / rate;
      console.log(`Progress: ${processed}/${churches.length} (${Math.round(processed/churches.length*100)}%) - Rate: ${Math.round(rate)}/s - ETA: ${Math.round(remaining)}s`);
    }
  }
  
  console.log('\n=== COMPLETE ===');
  console.log(`Processed: ${processed}`);
  console.log(`Updated: ${updated}`);
  console.log(`With boundaries: ${withBoundaries}`);
  console.log(`Time: ${Math.round((Date.now() - startTime) / 1000)}s`);
}

main().catch(console.error);
