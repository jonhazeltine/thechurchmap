#!/usr/bin/env npx tsx
/**
 * Backfill state_fips column for all boundaries from their external_id (GEOID)
 * 
 * Usage: npx tsx scripts/backfill-state-fips.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BATCH_SIZE = 200;
const PARALLEL_LIMIT = 10;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== Backfill state_fips from GEOID ===\n');
  
  // Get total count
  const { count: total } = await supabase
    .from('boundaries')
    .select('id', { count: 'exact', head: true })
    .is('state_fips', null);
  
  console.log(`Total boundaries without state_fips: ${total}\n`);
  
  if (!total || total === 0) {
    console.log('No boundaries need updating.');
    return;
  }
  
  const startTime = Date.now();
  let processed = 0;
  let updated = 0;
  let errors = 0;
  
  // Process in batches
  while (processed < total) {
    // Fetch a batch
    const { data: batch, error: fetchError } = await supabase
      .from('boundaries')
      .select('id, external_id, type')
      .is('state_fips', null)
      .limit(BATCH_SIZE);
    
    if (fetchError || !batch || batch.length === 0) {
      break;
    }
    
    // Prepare updates grouped by state_fips for efficiency
    const updatePromises: Promise<any>[] = [];
    
    for (let i = 0; i < batch.length; i += PARALLEL_LIMIT) {
      const chunk = batch.slice(i, i + PARALLEL_LIMIT);
      
      const promises = chunk.map(async (b) => {
        if (!b.external_id || b.external_id.length < 2) return false;
        
        const state_fips = b.external_id.substring(0, 2);
        const county_fips = b.type === 'county' ? b.external_id : null;
        
        const { error } = await supabase
          .from('boundaries')
          .update({ state_fips, county_fips })
          .eq('id', b.id);
        
        return !error;
      });
      
      const results = await Promise.all(promises);
      updated += results.filter(Boolean).length;
      errors += results.filter(r => !r).length;
    }
    
    processed += batch.length;
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (processed / parseFloat(elapsed)).toFixed(1);
    console.log(`Processed: ${processed}/${total} | Updated: ${updated} | Errors: ${errors} | Rate: ${rate}/s`);
    
    await sleep(50);
  }
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n=== Results ===');
  console.log(`Total processed: ${processed}`);
  console.log(`Updated: ${updated}`);
  console.log(`Errors: ${errors}`);
  console.log(`Time: ${totalTime}s`);
  
  // Verify
  const { count: withStateFips } = await supabase
    .from('boundaries')
    .select('id', { count: 'exact', head: true })
    .not('state_fips', 'is', null);
  
  console.log(`\nBoundaries with state_fips now: ${withStateFips}`);
  
  // Check Texas specifically
  const { count: txCounties } = await supabase
    .from('boundaries')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'county')
    .eq('state_fips', '48');
  
  console.log(`Texas counties: ${txCounties}`);
}

main().catch(console.error);
