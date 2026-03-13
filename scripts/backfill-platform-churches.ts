/**
 * Backfill Script: Sync Platform Church Links
 * 
 * This script re-syncs all church links for existing city platforms
 * based on their currently selected boundary geometries.
 * 
 * It uses ST_Intersects to find churches within platform boundaries,
 * ensuring all churches are properly linked regardless of which
 * boundary variant was originally selected.
 * 
 * Usage:
 *   npx tsx scripts/backfill-platform-churches.ts
 *   npx tsx scripts/backfill-platform-churches.ts --platform <platform-id>
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface Platform {
  id: string;
  name: string;
}

interface Church {
  church_id: string;
  church_name: string;
}

async function syncPlatformChurches(platformId: string, platformName: string): Promise<{ added: number; removed: number }> {
  console.log(`\n📍 Processing: ${platformName} (${platformId})`);
  
  // Get platform's boundary IDs
  const { data: boundaries, error: boundaryError } = await supabase
    .from('city_platform_boundaries')
    .select('boundary_id')
    .eq('city_platform_id', platformId);
  
  if (boundaryError) {
    console.error(`  ❌ Error fetching boundaries:`, boundaryError.message);
    return { added: 0, removed: 0 };
  }
  
  const boundaryIds = (boundaries || []).map(b => b.boundary_id);
  console.log(`  📦 Found ${boundaryIds.length} boundaries`);
  
  if (boundaryIds.length === 0) {
    // No boundaries - clear all church links
    const { error: clearError, count } = await supabase
      .from('city_platform_churches')
      .delete()
      .eq('city_platform_id', platformId);
    
    if (clearError) {
      console.error(`  ❌ Error clearing churches:`, clearError.message);
    } else {
      console.log(`  🗑️  Cleared ${count || 0} orphan church links`);
    }
    return { added: 0, removed: count || 0 };
  }
  
  // Find all churches within boundaries using spatial intersection
  const { data: validChurches, error: churchError } = await supabase.rpc(
    'fn_churches_within_boundaries',
    { p_boundary_ids: boundaryIds }
  );
  
  if (churchError) {
    console.error(`  ❌ Error finding churches in boundaries:`, churchError.message);
    return { added: 0, removed: 0 };
  }
  
  const validChurchIds = new Set((validChurches || []).map((c: Church) => c.church_id));
  console.log(`  🏛️  Found ${validChurchIds.size} churches within boundaries`);
  
  // Get current church links
  const { data: currentLinks } = await supabase
    .from('city_platform_churches')
    .select('church_id')
    .eq('city_platform_id', platformId);
  
  const currentChurchIds = new Set((currentLinks || []).map(l => l.church_id));
  
  // Calculate changes
  const toAdd = [...validChurchIds].filter(id => !currentChurchIds.has(id));
  const toRemove = [...currentChurchIds].filter(id => !validChurchIds.has(id));
  
  // Add missing churches
  if (toAdd.length > 0) {
    const inserts = toAdd.map(church_id => ({
      city_platform_id: platformId,
      church_id,
      status: 'visible',
      is_claimed: false,
    }));
    
    const { error: insertError } = await supabase
      .from('city_platform_churches')
      .upsert(inserts, { onConflict: 'city_platform_id,church_id', ignoreDuplicates: true });
    
    if (insertError) {
      console.error(`  ❌ Error adding churches:`, insertError.message);
    } else {
      console.log(`  ✅ Added ${toAdd.length} new church links`);
    }
  }
  
  // Remove orphaned churches
  if (toRemove.length > 0) {
    const { error: deleteError } = await supabase
      .from('city_platform_churches')
      .delete()
      .eq('city_platform_id', platformId)
      .in('church_id', toRemove);
    
    if (deleteError) {
      console.error(`  ❌ Error removing orphan churches:`, deleteError.message);
    } else {
      console.log(`  🗑️  Removed ${toRemove.length} orphan church links`);
    }
  }
  
  if (toAdd.length === 0 && toRemove.length === 0) {
    console.log(`  ✓ Already in sync`);
  }
  
  return { added: toAdd.length, removed: toRemove.length };
}

async function main() {
  const args = process.argv.slice(2);
  const platformIndex = args.indexOf('--platform');
  const specificPlatformId = platformIndex >= 0 ? args[platformIndex + 1] : null;
  
  console.log('🔄 Platform Church Sync Backfill Script');
  console.log('========================================\n');
  
  let platforms: Platform[];
  
  if (specificPlatformId) {
    const { data, error } = await supabase
      .from('city_platforms')
      .select('id, name')
      .eq('id', specificPlatformId)
      .single();
    
    if (error || !data) {
      console.error(`Platform not found: ${specificPlatformId}`);
      process.exit(1);
    }
    platforms = [data];
  } else {
    const { data, error } = await supabase
      .from('city_platforms')
      .select('id, name')
      .order('name');
    
    if (error) {
      console.error('Error fetching platforms:', error.message);
      process.exit(1);
    }
    platforms = data || [];
  }
  
  console.log(`Found ${platforms.length} platform(s) to process`);
  
  let totalAdded = 0;
  let totalRemoved = 0;
  
  for (const platform of platforms) {
    const result = await syncPlatformChurches(platform.id, platform.name);
    totalAdded += result.added;
    totalRemoved += result.removed;
  }
  
  console.log('\n========================================');
  console.log(`✅ Backfill complete!`);
  console.log(`   Added: ${totalAdded} church links`);
  console.log(`   Removed: ${totalRemoved} orphan links`);
}

main().catch(console.error);
