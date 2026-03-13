#!/usr/bin/env npx tsx
/**
 * Fast Texas church linking script with large parallel batches
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('=== Fast Texas Church Linking ===\n');
  
  // Get current status
  const { data: statusBefore } = await supabase
    .from('churches')
    .select('id, state', { count: 'exact' })
    .eq('state', 'TX')
    .or('boundary_ids.is.null,boundary_ids.eq.{}');
  
  const unlinkedCount = statusBefore?.length || 0;
  console.log(`Unlinked TX churches to process: ${unlinkedCount}\n`);
  
  // Fetch all unlinked TX churches  
  const { data: churches, error: fetchError } = await supabase
    .from('churches')
    .select('id, name, lat, lng')
    .eq('state', 'TX')
    .or('boundary_ids.is.null,boundary_ids.eq.{}')
    .limit(10000);
  
  if (fetchError || !churches) {
    console.error('Fetch error:', fetchError?.message);
    return;
  }
  
  console.log(`Fetched ${churches.length} churches to link\n`);
  
  // Process in parallel batches
  const BATCH_SIZE = 100;
  let linked = 0;
  let failed = 0;
  
  for (let i = 0; i < churches.length; i += BATCH_SIZE) {
    const batch = churches.slice(i, i + BATCH_SIZE);
    
    const results = await Promise.all(batch.map(async (church) => {
      if (!church.lat || !church.lng) return null;
      
      // Call the RPC to get boundaries for this church
      const { data: boundaries, error } = await supabase.rpc(
        'fn_get_boundaries_for_church',
        { lat: church.lat, lon: church.lng }
      );
      
      if (error || !boundaries || boundaries.length === 0) {
        return null;
      }
      
      // Extract boundary IDs
      const boundaryIds = boundaries.map((b: any) => b.id);
      
      // Update the church
      const { error: updateError } = await supabase
        .from('churches')
        .update({ boundary_ids: boundaryIds })
        .eq('id', church.id);
      
      return updateError ? null : church.id;
    }));
    
    const batchLinked = results.filter(r => r !== null).length;
    linked += batchLinked;
    failed += batch.length - batchLinked;
    
    console.log(`Progress: ${i + batch.length}/${churches.length} | Linked: ${linked} | No boundaries: ${failed}`);
  }
  
  console.log('\n=== Final Status ===');
  
  // Get final counts
  const { count: totalTX } = await supabase
    .from('churches')
    .select('id', { count: 'exact', head: true })
    .eq('state', 'TX');
  
  const { count: linkedTX } = await supabase
    .from('churches')
    .select('id', { count: 'exact', head: true })
    .eq('state', 'TX')
    .not('boundary_ids', 'is', null)
    .neq('boundary_ids', '{}');
  
  console.log(`Texas churches: ${linkedTX}/${totalTX} linked (${((linkedTX || 0) / (totalTX || 1) * 100).toFixed(1)}%)`);
  
  // Also check Michigan
  const { count: totalMI } = await supabase
    .from('churches')
    .select('id', { count: 'exact', head: true })
    .eq('state', 'MI');
  
  const { count: linkedMI } = await supabase
    .from('churches')
    .select('id', { count: 'exact', head: true })
    .eq('state', 'MI')
    .not('boundary_ids', 'is', null)
    .neq('boundary_ids', '{}');
  
  console.log(`Michigan churches: ${linkedMI}/${totalMI} linked (${((linkedMI || 0) / (totalMI || 1) * 100).toFixed(1)}%)`);
  
  console.log('\n✅ Linking complete!');
}

main().catch(console.error);
