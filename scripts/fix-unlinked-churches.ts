#!/usr/bin/env npx tsx
/**
 * Fix Unlinked Churches
 * 
 * Re-links churches that have empty boundary_ids arrays.
 * Uses fn_get_boundaries_for_church RPC which has county fallback.
 * 
 * Usage: 
 *   npx tsx scripts/fix-unlinked-churches.ts           # Fix all states
 *   npx tsx scripts/fix-unlinked-churches.ts --state MI  # Fix specific state
 */

import { createClient } from '@supabase/supabase-js';
import * as wkx from 'wkx';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PARALLEL_LIMIT = 20;
const BATCH_SIZE = 1000;
const MAX_RETRIES = 3;

interface Church {
  id: string;
  name: string;
  state: string;
  latitude: number;
  longitude: number;
}

function parseLocation(location: any): { lat: number; lon: number } | null {
  if (!location) return null;
  
  if (typeof location === 'string' && /^[0-9a-fA-F]+$/.test(location)) {
    try {
      const buffer = Buffer.from(location, 'hex');
      const geometry = wkx.Geometry.parse(buffer);
      if (geometry && 'x' in geometry && 'y' in geometry) {
        return { lon: (geometry as any).x, lat: (geometry as any).y };
      }
    } catch (e) {
      // Fall through
    }
  }
  
  if (typeof location === 'object' && location.coordinates) {
    const coords = location.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      return { lon: coords[0], lat: coords[1] };
    }
  }
  
  return null;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processChurchWithRetry(church: Church): Promise<{ success: boolean; boundaryCount: number; boundaryType: string | null }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data: boundaries, error: rpcError } = await supabase.rpc('fn_get_boundaries_for_church', {
        church_lat: church.latitude,
        church_lon: church.longitude
      });
      
      if (rpcError) {
        if (attempt < MAX_RETRIES) {
          await sleep(attempt * 500);
          continue;
        }
        console.log(`  ⚠️ RPC error for ${church.name}: ${rpcError.message}`);
        return { success: false, boundaryCount: 0, boundaryType: null };
      }
      
      if (!boundaries || boundaries.length === 0) {
        console.log(`  ⚠️ No boundaries found for ${church.name} (${church.state}) at ${church.latitude.toFixed(4)}, ${church.longitude.toFixed(4)}`);
        return { success: true, boundaryCount: 0, boundaryType: null };
      }
      
      const boundaryIds = boundaries.map((b: any) => b.id);
      const boundaryType = boundaries[0].type;
      
      const { error: updateError } = await supabase
        .from('churches')
        .update({ boundary_ids: boundaryIds })
        .eq('id', church.id);
      
      if (updateError) {
        if (attempt < MAX_RETRIES) {
          await sleep(attempt * 500);
          continue;
        }
        console.log(`  ⚠️ Update error for ${church.name}: ${updateError.message}`);
        return { success: false, boundaryCount: 0, boundaryType: null };
      }
      
      return { success: true, boundaryCount: boundaryIds.length, boundaryType };
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        await sleep(attempt * 500);
        continue;
      }
      return { success: false, boundaryCount: 0, boundaryType: null };
    }
  }
  return { success: false, boundaryCount: 0, boundaryType: null };
}

async function fetchUnlinkedChurches(stateFilter?: string): Promise<Church[]> {
  console.log(`Fetching unlinked churches${stateFilter ? ` for ${stateFilter}` : ''}...`);
  const allChurches: Church[] = [];
  let offset = 0;
  
  while (true) {
    let query = supabase
      .from('churches')
      .select('id, name, state, location, boundary_ids')
      .not('location', 'is', null)
      .eq('boundary_ids', '{}')
      .range(offset, offset + BATCH_SIZE - 1);
    
    if (stateFilter) {
      query = query.eq('state', stateFilter);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error fetching churches:', error);
      await sleep(2000);
      continue;
    }
    
    if (!data || data.length === 0) break;
    
    for (const c of data) {
      const parsed = parseLocation(c.location);
      if (parsed) {
        allChurches.push({
          id: c.id,
          name: c.name || 'Unknown',
          state: c.state || 'Unknown',
          longitude: parsed.lon,
          latitude: parsed.lat
        });
      }
    }
    
    console.log(`  Found ${allChurches.length} unlinked churches so far...`);
    
    if (data.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }
  
  return allChurches;
}

async function main() {
  const args = process.argv.slice(2);
  let stateFilter: string | undefined;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--state' && args[i + 1]) {
      stateFilter = args[i + 1].toUpperCase();
    }
  }
  
  console.log('=== Fix Unlinked Churches ===\n');
  console.log('This script re-links churches with empty boundary_ids arrays.');
  console.log('It uses fn_get_boundaries_for_church which has county fallback.\n');
  
  const churches = await fetchUnlinkedChurches(stateFilter);
  console.log(`\nTotal unlinked churches to fix: ${churches.length}\n`);
  
  if (churches.length === 0) {
    console.log('✅ No unlinked churches found!');
    return;
  }
  
  const startTime = Date.now();
  let processed = 0;
  let fixed = 0;
  let stillUnlinked = 0;
  let placeLinks = 0;
  let countyLinks = 0;
  let errors = 0;
  
  console.log('Processing churches...\n');
  
  for (let i = 0; i < churches.length; i += PARALLEL_LIMIT) {
    const batch = churches.slice(i, i + PARALLEL_LIMIT);
    const results = await Promise.all(batch.map(processChurchWithRetry));
    
    for (const result of results) {
      processed++;
      if (!result.success) {
        errors++;
      } else if (result.boundaryCount > 0) {
        fixed++;
        if (result.boundaryType === 'place') placeLinks++;
        else if (result.boundaryType === 'county') countyLinks++;
      } else {
        stillUnlinked++;
      }
    }
    
    if (processed % 100 === 0 || processed === churches.length) {
      const pct = ((processed / churches.length) * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  Processed ${processed}/${churches.length} (${pct}%) - Fixed: ${fixed}, Still unlinked: ${stillUnlinked} [${elapsed}s]`);
    }
  }
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n=== Results ===');
  console.log(`Total processed: ${processed}`);
  console.log(`Fixed: ${fixed}`);
  console.log(`  - Place boundaries: ${placeLinks}`);
  console.log(`  - County boundaries: ${countyLinks}`);
  console.log(`Still unlinked (no boundaries found): ${stillUnlinked}`);
  console.log(`Errors: ${errors}`);
  console.log(`Time: ${totalTime}s`);
  
  if (stillUnlinked > 0) {
    console.log('\n⚠️ Some churches could not be linked. They may be:');
    console.log('  - Outside state boundaries');
    console.log('  - In areas without imported place/county boundaries');
    console.log('  - On state borders with geometry edge cases');
  }
  
  if (fixed === churches.length) {
    console.log('\n✅ All unlinked churches have been fixed!');
  }
}

main().catch(console.error);
