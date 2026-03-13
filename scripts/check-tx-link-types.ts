#!/usr/bin/env npx tsx
/**
 * Check breakdown of TX church links by boundary type
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('=== Texas Church Linking Breakdown ===\n');
  
  // Get all TX boundaries with their types
  const { data: txBoundaries } = await supabase
    .from('boundaries')
    .select('id, type')
    .eq('state_fips', '48');
  
  if (!txBoundaries) {
    console.log('No boundaries found');
    return;
  }
  
  // Build type lookup
  const boundaryTypes = new Map<string, string>();
  for (const b of txBoundaries) {
    boundaryTypes.set(b.id, b.type);
  }
  
  console.log(`Texas boundaries loaded: ${txBoundaries.length}`);
  
  // Get all linked TX churches
  let allChurches: any[] = [];
  let offset = 0;
  const BATCH = 1000;
  
  while (true) {
    const { data: batch } = await supabase
      .from('churches')
      .select('id, name, boundary_ids')
      .eq('state', 'TX')
      .not('boundary_ids', 'is', null)
      .neq('boundary_ids', '{}')
      .range(offset, offset + BATCH - 1);
    
    if (!batch || batch.length === 0) break;
    allChurches = allChurches.concat(batch);
    if (batch.length < BATCH) break;
    offset += BATCH;
  }
  
  console.log(`Total linked TX churches: ${allChurches.length}\n`);
  
  // Count churches by their primary boundary type
  let placeLinked = 0;
  let countyLinked = 0;
  let tractLinked = 0;
  let unknownType = 0;
  
  for (const c of allChurches) {
    if (c.boundary_ids && c.boundary_ids.length > 0) {
      const primaryId = c.boundary_ids[0];
      const primaryType = boundaryTypes.get(primaryId);
      
      if (primaryType === 'place') placeLinked++;
      else if (primaryType === 'county') countyLinked++;
      else if (primaryType === 'census_tract') tractLinked++;
      else unknownType++;
    }
  }
  
  console.log('Churches linked by primary boundary type:');
  console.log(`  Places (cities/towns): ${placeLinked.toLocaleString()}`);
  console.log(`  Counties (fallback):   ${countyLinked.toLocaleString()}`);
  if (tractLinked > 0) console.log(`  Census Tracts: ${tractLinked}`);
  if (unknownType > 0) console.log(`  Unknown/Other: ${unknownType}`);
  
  const total = placeLinked + countyLinked + tractLinked + unknownType;
  const placePct = (placeLinked / total * 100).toFixed(1);
  const countyPct = (countyLinked / total * 100).toFixed(1);
  console.log(`\n${placePct}% linked to places, ${countyPct}% to counties`);
}

main().catch(console.error);
