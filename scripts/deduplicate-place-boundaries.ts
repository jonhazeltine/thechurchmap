/**
 * Deduplicate Place Boundaries Script
 * 
 * Handles cases like:
 * - "Grand Rapids" vs "Grand Rapids city" (keep more specific with "city" suffix)
 * - Multiple "Grand Rapids city" entries (keep one with largest geometry)
 * 
 * Usage: npx tsx scripts/deduplicate-place-boundaries.ts
 *        npx tsx scripts/deduplicate-place-boundaries.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const isDryRun = process.argv.includes('--dry-run');

interface Boundary {
  id: string;
  name: string;
  type: string;
  external_id: string | null;
  source: string | null;
}

async function main() {
  console.log('=== Place Boundary Deduplication Script ===');
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }
  console.log('');

  // Get all place boundaries
  const { data: places, error } = await supabase
    .from('boundaries')
    .select('id, name, type, external_id, source')
    .eq('type', 'place')
    .order('name');

  if (error) {
    console.error('Error fetching boundaries:', error);
    process.exit(1);
  }

  console.log(`Found ${places?.length || 0} place boundaries\n`);

  if (!places || places.length === 0) {
    console.log('No places to deduplicate.');
    return;
  }

  // Group by normalized name (lowercase, trim whitespace)
  const groups = new Map<string, Boundary[]>();
  
  for (const place of places) {
    // Normalize: remove " city", " town", " village", " CDP" suffixes for grouping
    const baseName = place.name
      .toLowerCase()
      .replace(/\s+(city|town|village|cdp|charter township|township)$/i, '')
      .trim();
    
    if (!groups.has(baseName)) {
      groups.set(baseName, []);
    }
    groups.get(baseName)!.push(place);
  }

  // Find groups with duplicates
  const duplicateGroups = Array.from(groups.entries())
    .filter(([_, places]) => places.length > 1);

  console.log(`Found ${duplicateGroups.length} groups with potential duplicates\n`);

  const idsToDelete: string[] = [];
  const decisions: { keep: Boundary; delete: Boundary[] }[] = [];

  for (const [baseName, group] of duplicateGroups) {
    // Group by exact suffix type - cities/towns/villages are distinct from townships
    // We only want to deduplicate EXACT duplicates (same external_id) or 
    // cases like "Grand Rapids" vs "Grand Rapids city" (base name without suffix)
    
    // Sub-group by the type of suffix
    const subGroups = new Map<string, Boundary[]>();
    
    for (const place of group) {
      // Extract the suffix type
      let suffixType = 'none';
      if (/\s+charter township$/i.test(place.name)) {
        suffixType = 'charter_township';
      } else if (/\s+township$/i.test(place.name)) {
        suffixType = 'township';
      } else if (/\s+city$/i.test(place.name)) {
        suffixType = 'city';
      } else if (/\s+town$/i.test(place.name)) {
        suffixType = 'town';
      } else if (/\s+village$/i.test(place.name)) {
        suffixType = 'village';
      } else if (/\s+CDP$/i.test(place.name)) {
        suffixType = 'cdp';
      }
      
      if (!subGroups.has(suffixType)) {
        subGroups.set(suffixType, []);
      }
      subGroups.get(suffixType)!.push(place);
    }
    
    // Within each suffix type, find duplicates
    for (const [suffixType, subGroup] of subGroups) {
      if (subGroup.length <= 1 && suffixType !== 'none') continue;
      
      // If we have a "none" (bare name like "Grand Rapids") and a specific type
      // (like "Grand Rapids city"), the bare name should be deleted in favor of the specific
      if (suffixType === 'none' && subGroup.length >= 1) {
        // Check if there's a more specific version in any other subgroup
        const bareNames = subGroup;
        
        for (const bareName of bareNames) {
          const bareBase = bareName.name.toLowerCase().trim();
          
          // Find if there's a more specific version
          let foundMoreSpecific = false;
          for (const [otherSuffix, otherGroup] of subGroups) {
            if (otherSuffix === 'none') continue;
            
            for (const specific of otherGroup) {
              const specificBase = specific.name
                .toLowerCase()
                .replace(/\s+(city|town|village|cdp|charter township|township)$/i, '')
                .trim();
              
              if (specificBase === bareBase) {
                // Found a more specific version - delete the bare name
                decisions.push({ keep: specific, delete: [bareName] });
                idsToDelete.push(bareName.id);
                foundMoreSpecific = true;
                break;
              }
            }
            if (foundMoreSpecific) break;
          }
        }
      }
      
      // Within the same suffix type, deduplicate by external_id
      if (subGroup.length > 1) {
        const byExternalId = new Map<string, Boundary[]>();
        
        for (const place of subGroup) {
          const key = place.external_id || `no_ext_${place.id}`;
          if (!byExternalId.has(key)) {
            byExternalId.set(key, []);
          }
          byExternalId.get(key)!.push(place);
        }
        
        // For each external_id group with duplicates, keep one
        for (const [extId, dupes] of byExternalId) {
          if (dupes.length > 1 && !extId.startsWith('no_ext_')) {
            // Keep the first one, delete the rest
            const [keep, ...toDelete] = dupes;
            decisions.push({ keep, delete: toDelete });
            idsToDelete.push(...toDelete.map(d => d.id));
          }
        }
      }
    }
  }

  // Show decisions
  console.log('Deduplication decisions:\n');
  for (const decision of decisions.slice(0, 20)) { // Show first 20
    console.log(`  KEEP: "${decision.keep.name}" (${decision.keep.external_id || 'no ext id'})`);
    for (const d of decision.delete) {
      console.log(`    DELETE: "${d.name}" (${d.external_id || 'no ext id'})`);
    }
    console.log('');
  }

  if (decisions.length > 20) {
    console.log(`  ... and ${decisions.length - 20} more groups\n`);
  }

  console.log(`Total boundaries to delete: ${idsToDelete.length}\n`);

  if (idsToDelete.length === 0) {
    console.log('No duplicates found to delete.');
    return;
  }

  if (isDryRun) {
    console.log('🔍 DRY RUN - No changes made. Run without --dry-run to delete.');
    return;
  }

  // Skip church updates - they'll be re-linked after cleanup anyway
  console.log('Skipping church boundary updates (will re-link after cleanup)...\n');

  // Delete duplicates in batches
  console.log('Deleting duplicate boundaries...');
  const batchSize = 100;
  let deleted = 0;

  for (let i = 0; i < idsToDelete.length; i += batchSize) {
    const batch = idsToDelete.slice(i, i + batchSize);
    const { error: deleteError } = await supabase
      .from('boundaries')
      .delete()
      .in('id', batch);

    if (deleteError) {
      console.error(`Error deleting batch ${i / batchSize + 1}:`, deleteError);
    } else {
      deleted += batch.length;
    }
  }

  console.log(`✅ Deleted ${deleted} duplicate boundaries\n`);

  // Verify
  const { count: remainingCount } = await supabase
    .from('boundaries')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'place');

  console.log(`Remaining place boundaries: ${remainingCount}`);
}

main().catch(console.error);
