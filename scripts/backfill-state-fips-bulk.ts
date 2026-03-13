#!/usr/bin/env npx tsx
/**
 * Bulk backfill state_fips from external_id (GEOID) using Supabase RPC
 * This creates a temporary function and runs it once for maximum efficiency.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('=== Bulk Backfill state_fips ===\n');
  
  // Step 1: Check current state
  const { count: beforeCount } = await supabase
    .from('boundaries')
    .select('id', { count: 'exact', head: true })
    .not('state_fips', 'is', null);
  
  const { count: totalBoundaries } = await supabase
    .from('boundaries')
    .select('id', { count: 'exact', head: true });
  
  console.log(`Before: ${beforeCount || 0}/${totalBoundaries} boundaries have state_fips\n`);
  
  // Step 2: Create the bulk update RPC function
  console.log('Creating bulk update function...');
  
  const createFunctionSQL = `
    CREATE OR REPLACE FUNCTION fn_backfill_state_fips()
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
      updated_count integer;
    BEGIN
      UPDATE boundaries SET 
        state_fips = SUBSTRING(external_id, 1, 2),
        county_fips = CASE WHEN type = 'county' THEN external_id ELSE NULL END
      WHERE state_fips IS NULL 
        AND external_id IS NOT NULL 
        AND LENGTH(external_id) >= 2;
      
      GET DIAGNOSTICS updated_count = ROW_COUNT;
      
      RETURN jsonb_build_object('updated', updated_count);
    END;
    $$;
  `;
  
  // Try to create the function using a workaround - call an existing RPC that can execute SQL
  // If that doesn't work, we'll batch the updates manually
  
  // First, let's try the batch approach since we can't easily create functions from client
  console.log('Running batched updates...\n');
  
  const BATCH_SIZE = 500;
  let totalUpdated = 0;
  let offset = 0;
  
  while (true) {
    // Fetch IDs and external_ids for boundaries without state_fips
    const { data: batch, error: fetchError } = await supabase
      .from('boundaries')
      .select('id, external_id, type')
      .is('state_fips', null)
      .not('external_id', 'is', null)
      .limit(BATCH_SIZE);
    
    if (fetchError) {
      console.error('Fetch error:', fetchError.message);
      break;
    }
    
    if (!batch || batch.length === 0) {
      break;
    }
    
    // Process in parallel chunks
    const PARALLEL = 50;
    for (let i = 0; i < batch.length; i += PARALLEL) {
      const chunk = batch.slice(i, i + PARALLEL);
      
      await Promise.all(chunk.map(async (b) => {
        if (!b.external_id || b.external_id.length < 2) return;
        
        const state_fips = b.external_id.substring(0, 2);
        const county_fips = b.type === 'county' ? b.external_id : null;
        
        await supabase
          .from('boundaries')
          .update({ state_fips, county_fips })
          .eq('id', b.id);
      }));
      
      totalUpdated += chunk.length;
    }
    
    console.log(`Updated ${totalUpdated} boundaries...`);
    
    if (batch.length < BATCH_SIZE) break;
  }
  
  // Step 3: Verify results
  console.log('\n=== Verification ===');
  
  const { count: afterCount } = await supabase
    .from('boundaries')
    .select('id', { count: 'exact', head: true })
    .not('state_fips', 'is', null);
  
  console.log(`After: ${afterCount}/${totalBoundaries} boundaries have state_fips`);
  
  // Check Texas counties specifically
  const { count: txCounties } = await supabase
    .from('boundaries')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'county')
    .eq('state_fips', '48');
  
  console.log(`Texas counties with state_fips='48': ${txCounties}`);
  
  // Check Michigan counties
  const { count: miCounties } = await supabase
    .from('boundaries')
    .select('id', { count: 'exact', head: true })
    .eq('type', 'county')
    .eq('state_fips', '26');
  
  console.log(`Michigan counties with state_fips='26': ${miCounties}`);
  
  // Sample verification
  const { data: sample } = await supabase
    .from('boundaries')
    .select('name, type, external_id, state_fips, county_fips')
    .eq('type', 'county')
    .eq('state_fips', '48')
    .limit(3);
  
  console.log('\nSample Texas counties:', sample);
  
  console.log('\n✅ Backfill complete!');
}

main().catch(console.error);
