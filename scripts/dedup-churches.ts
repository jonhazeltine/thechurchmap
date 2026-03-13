#!/usr/bin/env npx tsx
/**
 * Church Deduplication Script
 * 
 * CRITICAL: Must be run after OSM church ingestion to prevent duplicate churches.
 * 
 * Deduplication Strategy:
 * 1. Find churches with same name (case-insensitive) within 100m radius
 * 2. Keep the one with more complete data (more non-null fields)
 * 3. If tied, keep the oldest (by created_at)
 * 4. Merge any ministry areas or team members to the kept church
 * 5. Delete the duplicates
 * 
 * Usage:
 *   npx tsx scripts/dedup-churches.ts [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const DRY_RUN = process.argv.includes('--dry-run');
const DEDUP_RADIUS_METERS = 100;

interface DuplicateGroup {
  name: string;
  churches: Church[];
}

interface Church {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  phone: string | null;
  denomination: string | null;
  description: string | null;
  created_at: string;
  completeness_score: number;
}

function calculateCompleteness(church: Church): number {
  let score = 0;
  if (church.address) score += 2;
  if (church.latitude && church.longitude) score += 2;
  if (church.website) score += 1;
  if (church.phone) score += 1;
  if (church.denomination) score += 1;
  if (church.description) score += 1;
  return score;
}

async function findDuplicates(supabase: any): Promise<DuplicateGroup[]> {
  console.log('🔍 Finding potential duplicate churches...');
  
  // Get all churches grouped by normalized name (first 50 chars, lowercase)
  const { data: churches, error } = await supabase
    .from('churches')
    .select('id, name, address, latitude, longitude, website, phone, denomination, description, created_at')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .eq('approval_status', 'approved')
    .order('name');

  if (error) {
    console.error('Error fetching churches:', error.message);
    return [];
  }

  // Group by normalized name
  const byName: Map<string, Church[]> = new Map();
  
  for (const church of churches || []) {
    const normalizedName = church.name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 40);

    if (!byName.has(normalizedName)) {
      byName.set(normalizedName, []);
    }
    
    const withScore = {
      ...church,
      completeness_score: calculateCompleteness(church as Church),
    };
    byName.get(normalizedName)!.push(withScore);
  }

  // Filter to groups with potential duplicates (same name, nearby location)
  const duplicateGroups: DuplicateGroup[] = [];

  for (const [name, group] of byName) {
    if (group.length < 2) continue;

    // Check for churches within DEDUP_RADIUS_METERS of each other
    const nearbyGroups: Church[][] = [];
    const processed = new Set<string>();

    for (let i = 0; i < group.length; i++) {
      if (processed.has(group[i].id)) continue;

      const cluster: Church[] = [group[i]];
      processed.add(group[i].id);

      for (let j = i + 1; j < group.length; j++) {
        if (processed.has(group[j].id)) continue;

        const distance = haversineDistance(
          group[i].latitude!,
          group[i].longitude!,
          group[j].latitude!,
          group[j].longitude!
        );

        if (distance <= DEDUP_RADIUS_METERS) {
          cluster.push(group[j]);
          processed.add(group[j].id);
        }
      }

      if (cluster.length > 1) {
        nearbyGroups.push(cluster);
      }
    }

    for (const cluster of nearbyGroups) {
      duplicateGroups.push({
        name: cluster[0].name,
        churches: cluster,
      });
    }
  }

  return duplicateGroups;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

function selectPrimary(churches: Church[]): { primary: Church; duplicates: Church[] } {
  // Sort by completeness score (desc), then by created_at (asc for oldest)
  const sorted = [...churches].sort((a, b) => {
    if (b.completeness_score !== a.completeness_score) {
      return b.completeness_score - a.completeness_score;
    }
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  return {
    primary: sorted[0],
    duplicates: sorted.slice(1),
  };
}

async function mergeDuplicates(supabase: any, primary: Church, duplicates: Church[]): Promise<void> {
  const duplicateIds = duplicates.map((d) => d.id);
  
  console.log(`  ↳ Keeping: ${primary.id.substring(0, 8)}... (score: ${primary.completeness_score})`);
  console.log(`  ↳ Merging: ${duplicateIds.length} duplicates`);

  if (DRY_RUN) {
    console.log('  ↳ [DRY RUN] Would merge and delete duplicates');
    return;
  }

  // 1. Update ministry areas to point to primary
  const { error: areaError } = await supabase
    .from('areas')
    .update({ church_id: primary.id })
    .in('church_id', duplicateIds);

  if (areaError) {
    console.error(`  ↳ Error updating areas: ${areaError.message}`);
  }

  // 2. Update church team memberships
  const { error: teamError } = await supabase
    .from('church_team')
    .update({ church_id: primary.id })
    .in('church_id', duplicateIds);

  if (teamError && !teamError.message.includes('duplicate key')) {
    console.error(`  ↳ Error updating team: ${teamError.message}`);
  }

  // 3. Update prayer requests
  const { error: prayerError } = await supabase
    .from('prayers')
    .update({ church_id: primary.id })
    .in('church_id', duplicateIds);

  if (prayerError) {
    console.error(`  ↳ Error updating prayers: ${prayerError.message}`);
  }

  // 4. Update community posts
  const { error: postError } = await supabase
    .from('community_posts')
    .update({ church_id: primary.id })
    .in('church_id', duplicateIds);

  if (postError) {
    console.error(`  ↳ Error updating posts: ${postError.message}`);
  }

  // 5. Update platform church links
  const { error: platformError } = await supabase
    .from('city_platform_churches')
    .update({ church_id: primary.id })
    .in('church_id', duplicateIds);

  if (platformError && !platformError.message.includes('duplicate key')) {
    console.error(`  ↳ Error updating platform links: ${platformError.message}`);
  }

  // 6. Delete duplicate churches
  const { error: deleteError } = await supabase
    .from('churches')
    .delete()
    .in('id', duplicateIds);

  if (deleteError) {
    console.error(`  ↳ Error deleting duplicates: ${deleteError.message}`);
  } else {
    console.log(`  ↳ Deleted ${duplicateIds.length} duplicates`);
  }
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║             CHURCH DEDUPLICATION SCRIPT                       ║
║  ${DRY_RUN ? '🔍 DRY RUN MODE - No changes will be made' : '⚠️  LIVE MODE - Changes will be applied'}                 ║
╚══════════════════════════════════════════════════════════════╝
`);

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Find duplicates
  const duplicates = await findDuplicates(supabase);
  
  console.log(`\n📊 Found ${duplicates.length} duplicate groups\n`);

  if (duplicates.length === 0) {
    console.log('✅ No duplicates found. Database is clean.');
    return;
  }

  let totalMerged = 0;
  let totalDeleted = 0;

  for (const group of duplicates) {
    console.log(`\n📍 "${group.name}" (${group.churches.length} copies)`);
    
    const { primary, duplicates: dupes } = selectPrimary(group.churches);
    await mergeDuplicates(supabase, primary, dupes);
    
    totalMerged += 1;
    totalDeleted += dupes.length;
  }

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                      SUMMARY                                  ║
╠══════════════════════════════════════════════════════════════╣
║  Duplicate groups processed: ${totalMerged.toString().padStart(5)}                         ║
║  Churches deleted:           ${totalDeleted.toString().padStart(5)}                         ║
${DRY_RUN ? '║  MODE: DRY RUN - No actual changes made                     ║' : '║  MODE: LIVE - Changes applied                               ║'}
╚══════════════════════════════════════════════════════════════╝
`);
}

main().catch(console.error);
