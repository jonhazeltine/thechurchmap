/**
 * Cleanup Script: Remove all county subdivision boundaries
 * 
 * These are redundant with place boundaries and cause duplicate entries
 * in the platform creation search. Townships like "Grand Rapids charter township"
 * are already registered as type 'place' so they won't be lost.
 * 
 * Usage: npx tsx scripts/cleanup-county-subdivisions.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('=== County Subdivision Cleanup Script ===\n');

  // First, count how many county subdivisions exist
  const { count: totalCount, error: countError } = await supabase
    .from('boundaries')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'county subdivision');

  if (countError) {
    console.error('Error counting county subdivisions:', countError);
    process.exit(1);
  }

  console.log(`Found ${totalCount} county subdivision boundaries to delete\n`);

  if (totalCount === 0) {
    console.log('No county subdivisions found. Nothing to delete.');
    return;
  }

  // Show some examples before deleting
  const { data: samples, error: sampleError } = await supabase
    .from('boundaries')
    .select('id, name, type')
    .eq('type', 'county subdivision')
    .limit(10);

  if (!sampleError && samples) {
    console.log('Sample county subdivisions to be deleted:');
    samples.forEach(s => console.log(`  - ${s.name}`));
    console.log('');
  }

  // Check if any of these are linked to churches
  const { data: linkedChurches, error: linkedError } = await supabase
    .from('boundaries')
    .select('id')
    .eq('type', 'county subdivision');

  if (!linkedError && linkedChurches) {
    // Get boundary IDs
    const boundaryIds = linkedChurches.map(b => b.id);
    
    // Check churches that have these in their boundary_ids array
    const { data: churchesWithSubdivisions, error: churchError } = await supabase
      .from('churches')
      .select('id, name, boundary_ids')
      .not('boundary_ids', 'is', null);

    if (!churchError && churchesWithSubdivisions) {
      const affectedChurches = churchesWithSubdivisions.filter(c => 
        c.boundary_ids?.some((bid: string) => boundaryIds.includes(bid))
      );
      
      if (affectedChurches.length > 0) {
        console.log(`⚠️  ${affectedChurches.length} churches have county subdivision boundaries linked.`);
        console.log('   These will need to be re-linked after cleanup.\n');
      }
    }
  }

  // Perform the deletion
  console.log('Deleting county subdivision boundaries...');
  
  const { error: deleteError } = await supabase
    .from('boundaries')
    .delete()
    .eq('type', 'county subdivision');

  if (deleteError) {
    console.error('Error deleting county subdivisions:', deleteError);
    process.exit(1);
  }

  console.log(`✅ Successfully deleted ${totalCount} county subdivision boundaries\n`);

  // Verify deletion
  const { count: remainingCount } = await supabase
    .from('boundaries')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'county subdivision');

  console.log(`Remaining county subdivisions: ${remainingCount || 0}`);

  // Show remaining boundary types
  const { data: typeCounts, error: typeError } = await supabase
    .rpc('get_boundary_type_counts');

  if (!typeError && typeCounts) {
    console.log('\nRemaining boundary types:');
    typeCounts.forEach((t: any) => console.log(`  - ${t.type}: ${t.count}`));
  } else {
    // Fallback: manual count query
    const { data: types } = await supabase
      .from('boundaries')
      .select('type');
    
    if (types) {
      const counts: Record<string, number> = {};
      types.forEach(t => {
        counts[t.type] = (counts[t.type] || 0) + 1;
      });
      console.log('\nRemaining boundary types:');
      Object.entries(counts).forEach(([type, count]) => {
        console.log(`  - ${type}: ${count}`);
      });
    }
  }
}

main().catch(console.error);
