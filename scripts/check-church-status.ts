#!/usr/bin/env npx tsx
/**
 * Check church linking status by state
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('=== Church Linking Status ===\n');
  
  // Get stats for each state
  const states = ['MI', 'TX'];
  
  for (const state of states) {
    const { count: total } = await supabase
      .from('churches')
      .select('id', { count: 'exact', head: true })
      .eq('state', state);
    
    const { count: linked } = await supabase
      .from('churches')
      .select('id', { count: 'exact', head: true })
      .eq('state', state)
      .not('boundary_ids', 'is', null)
      .neq('boundary_ids', '{}');
    
    const { count: noLocation } = await supabase
      .from('churches')
      .select('id', { count: 'exact', head: true })
      .eq('state', state)
      .is('location', null);
    
    const unlinked = (total || 0) - (linked || 0);
    const pct = total ? ((linked || 0) / total * 100).toFixed(1) : 0;
    
    console.log(`${state}:`);
    console.log(`  Total: ${total}`);
    console.log(`  Linked: ${linked} (${pct}%)`);
    console.log(`  Unlinked: ${unlinked}`);
    console.log(`  No location: ${noLocation}\n`);
  }
  
  // Check how many boundaries exist with state_fips
  const { count: txBoundaries } = await supabase
    .from('boundaries')
    .select('id', { count: 'exact', head: true })
    .eq('state_fips', '48');
  
  const { count: txPlaces } = await supabase
    .from('boundaries')
    .select('id', { count: 'exact', head: true })
    .eq('state_fips', '48')
    .eq('type', 'place');
  
  const { count: txCounties } = await supabase
    .from('boundaries')
    .select('id', { count: 'exact', head: true })
    .eq('state_fips', '48')
    .eq('type', 'county');
  
  console.log('Texas Boundaries:');
  console.log(`  Total: ${txBoundaries}`);
  console.log(`  Places: ${txPlaces}`);
  console.log(`  Counties: ${txCounties}`);
}

main().catch(console.error);
