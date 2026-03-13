/**
 * Cleanup exact-name duplicates in place boundaries
 * When two entries have the exact same name and type, keep one with smallest external_id
 * 
 * Usage: npx tsx scripts/cleanup-exact-name-duplicates.ts
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
  console.log('=== Exact Name Duplicate Cleanup ===\n');

  // Get all place boundaries
  const { data: places, error } = await supabase
    .from('boundaries')
    .select('id, name, type, external_id')
    .eq('type', 'place')
    .order('name');

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  // Group by exact name
  const groups = new Map<string, typeof places>();
  
  for (const place of places!) {
    const key = place.name.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(place);
  }

  // Find exact duplicates
  const idsToDelete: string[] = [];
  
  for (const [name, group] of groups) {
    if (group.length > 1) {
      // Sort by external_id (prefer official Census IDs which are typically shorter)
      const sorted = [...group].sort((a, b) => {
        const aId = a.external_id || '';
        const bId = b.external_id || '';
        return aId.length - bId.length || aId.localeCompare(bId);
      });
      
      const [keep, ...toDelete] = sorted;
      console.log(`KEEP: "${keep.name}" (${keep.external_id})`);
      for (const d of toDelete) {
        console.log(`  DELETE: "${d.name}" (${d.external_id})`);
        idsToDelete.push(d.id);
      }
      console.log('');
    }
  }

  if (idsToDelete.length === 0) {
    console.log('No exact duplicates found.');
    return;
  }

  console.log(`Deleting ${idsToDelete.length} duplicates...`);
  
  const { error: deleteError } = await supabase
    .from('boundaries')
    .delete()
    .in('id', idsToDelete);

  if (deleteError) {
    console.error('Error deleting:', deleteError);
  } else {
    console.log('✅ Done!');
  }
}

main().catch(console.error);
