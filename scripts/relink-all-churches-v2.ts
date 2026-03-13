#!/usr/bin/env npx tsx
/**
 * Re-link ALL churches to place boundaries (v2)
 * 
 * Uses direct table query and wkx to parse EWKB location data.
 * 
 * Usage: npx tsx scripts/relink-all-churches-v2.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as wkx from 'wkx';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PARALLEL_LIMIT = 20;
const BATCH_SIZE = 1000;
const AREA_SIMILARITY_THRESHOLD = 0.05;
const MAX_RETRIES = 3;

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

function parseLocation(location: any): { lat: number; lon: number } | null {
  if (!location) return null;
  
  // Try EWKB hex string (PostGIS format)
  if (typeof location === 'string' && /^[0-9a-fA-F]+$/.test(location)) {
    try {
      const buffer = Buffer.from(location, 'hex');
      const geometry = wkx.Geometry.parse(buffer);
      if (geometry && 'x' in geometry && 'y' in geometry) {
        return { lon: (geometry as any).x, lat: (geometry as any).y };
      }
    } catch (e) {
      // Fall through to other methods
    }
  }
  
  // Try GeoJSON format
  if (typeof location === 'object' && location.coordinates) {
    const coords = location.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      return { lon: coords[0], lat: coords[1] };
    }
  }
  
  return null;
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

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processChurchWithRetry(church: Church): Promise<{ updated: boolean; boundaries: number }> {
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
        return { updated: false, boundaries: 0 };
      }
      
      const dedupedIds = deduplicateBoundaries(boundaries || []);
      
      const { error: updateError } = await supabase
        .from('churches')
        .update({ boundary_ids: dedupedIds })
        .eq('id', church.id);
      
      if (updateError) {
        if (attempt < MAX_RETRIES) {
          await sleep(attempt * 500);
          continue;
        }
        return { updated: false, boundaries: 0 };
      }
      
      return { updated: true, boundaries: dedupedIds.length };
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        await sleep(attempt * 500);
        continue;
      }
      return { updated: false, boundaries: 0 };
    }
  }
  return { updated: false, boundaries: 0 };
}

async function fetchAllChurches(): Promise<Church[]> {
  console.log('Fetching all churches with locations (paginated)...');
  const allChurches: Church[] = [];
  let offset = 0;
  let failedParse = 0;
  
  while (true) {
    const { data, error } = await supabase
      .from('churches')
      .select('id, name, location')
      .not('location', 'is', null)
      .range(offset, offset + BATCH_SIZE - 1);
    
    if (error) {
      console.error('Error fetching churches:', error);
      // Wait and retry on error
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
          longitude: parsed.lon,
          latitude: parsed.lat
        });
      } else {
        failedParse++;
      }
    }
    
    console.log(`  Fetched ${allChurches.length} churches (${failedParse} failed to parse)...`);
    
    if (data.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }
  
  return allChurches;
}

async function main() {
  console.log('=== Re-link All Churches to Place Boundaries (v2 with EWKB) ===\n');
  
  // Step 1: Get all churches with coordinates
  const churches = await fetchAllChurches();
  console.log(`\nTotal: ${churches.length} churches with valid coordinates\n`);
  
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
  const startTime = Date.now();
  let processed = 0;
  let updated = 0;
  let withBoundaries = 0;
  
  for (let i = 0; i < churches.length; i += PARALLEL_LIMIT) {
    const batch = churches.slice(i, i + PARALLEL_LIMIT);
    const results = await Promise.all(batch.map(processChurchWithRetry));
    
    for (const result of results) {
      processed++;
      if (result.updated) updated++;
      if (result.boundaries > 0) withBoundaries++;
    }
    
    if (processed % 500 === 0 || processed === churches.length) {
      const pct = ((processed / churches.length) * 100).toFixed(1);
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      const rate = (processed / ((Date.now() - startTime) / 1000)).toFixed(1);
      console.log(`  Processed ${processed}/${churches.length} (${pct}%) - ${withBoundaries} have boundaries [${elapsed}min, ${rate}/sec]`);
    }
  }
  
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n✅ Complete in ${totalTime} minutes!`);
  console.log(`   Total: ${processed}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   With boundaries: ${withBoundaries} (${((withBoundaries / processed) * 100).toFixed(1)}%)`);
}

main().catch(console.error);
