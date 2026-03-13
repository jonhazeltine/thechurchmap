#!/usr/bin/env npx tsx
/**
 * Link Churches to City Platforms Script
 * 
 * Automatically links churches to city platforms based on geographic boundaries.
 * This script uses PostGIS spatial queries to find churches within platform boundaries
 * and creates the appropriate records in city_platform_churches.
 * 
 * This script should be run:
 * - After church ingestion (OSM imports)
 * - After platform boundary changes
 * - As a periodic maintenance task
 * 
 * Usage:
 *   npx tsx scripts/link-churches-to-platforms.ts              # Process all platforms
 *   npx tsx scripts/link-churches-to-platforms.ts --platform <id>  # Process specific platform
 *   npx tsx scripts/link-churches-to-platforms.ts --dry-run    # Preview without making changes
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface PlatformInfo {
  id: string;
  name: string;
  slug: string;
}

interface BoundaryLink {
  boundary_id: string;
}

interface ChurchInBoundary {
  church_id: string;
  church_name: string;
  city: string | null;
  state: string | null;
}

interface LinkResult {
  platformId: string;
  platformName: string;
  boundaryCount: number;
  churchesFound: number;
  newLinksCreated: number;
  alreadyLinked: number;
  errors: number;
}

async function getPlatforms(specificPlatformId?: string): Promise<PlatformInfo[]> {
  let query = supabase
    .from('city_platforms')
    .select('id, name, slug')
    .eq('is_active', true);
  
  if (specificPlatformId) {
    query = query.eq('id', specificPlatformId);
  }
  
  const { data, error } = await query;
  
  if (error) {
    console.error('Error fetching platforms:', error);
    return [];
  }
  
  return data || [];
}

async function getPlatformBoundaries(platformId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('city_platform_boundaries')
    .select('boundary_id')
    .eq('city_platform_id', platformId);
  
  if (error) {
    console.error(`Error fetching boundaries for platform ${platformId}:`, error);
    return [];
  }
  
  return (data || []).map((b: BoundaryLink) => b.boundary_id);
}

async function getExistingLinks(platformId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('city_platform_churches')
    .select('church_id')
    .eq('city_platform_id', platformId);
  
  if (error) {
    console.error(`Error fetching existing links for platform ${platformId}:`, error);
    return new Set();
  }
  
  return new Set((data || []).map((c: { church_id: string }) => c.church_id));
}

async function findChurchesInBoundaries(boundaryIds: string[]): Promise<ChurchInBoundary[]> {
  if (boundaryIds.length === 0) return [];
  
  const { data, error } = await supabase.rpc(
    'fn_churches_within_boundaries',
    { p_boundary_ids: boundaryIds }
  );
  
  if (error) {
    console.error('Error finding churches in boundaries:', error);
    return [];
  }
  
  return data || [];
}

async function linkChurchesToPlatform(
  platformId: string,
  churchIds: string[],
  dryRun: boolean
): Promise<{ created: number; errors: number }> {
  if (churchIds.length === 0 || dryRun) {
    return { created: churchIds.length, errors: 0 };
  }
  
  const links = churchIds.map(churchId => ({
    city_platform_id: platformId,
    church_id: churchId,
    status: 'visible' as const,
  }));
  
  const { error } = await supabase
    .from('city_platform_churches')
    .insert(links);
  
  if (error) {
    console.error(`Error linking churches to platform ${platformId}:`, error);
    return { created: 0, errors: churchIds.length };
  }
  
  return { created: churchIds.length, errors: 0 };
}

async function processPlatform(platform: PlatformInfo, dryRun: boolean): Promise<LinkResult> {
  const result: LinkResult = {
    platformId: platform.id,
    platformName: platform.name,
    boundaryCount: 0,
    churchesFound: 0,
    newLinksCreated: 0,
    alreadyLinked: 0,
    errors: 0,
  };
  
  const boundaryIds = await getPlatformBoundaries(platform.id);
  result.boundaryCount = boundaryIds.length;
  
  if (boundaryIds.length === 0) {
    console.log(`  ${platform.name}: No boundaries defined, skipping`);
    return result;
  }
  
  const existingLinks = await getExistingLinks(platform.id);
  const churchesInBoundaries = await findChurchesInBoundaries(boundaryIds);
  result.churchesFound = churchesInBoundaries.length;
  
  const newChurchIds = churchesInBoundaries
    .filter(c => !existingLinks.has(c.church_id))
    .map(c => c.church_id);
  
  result.alreadyLinked = churchesInBoundaries.length - newChurchIds.length;
  
  if (newChurchIds.length > 0) {
    const linkResult = await linkChurchesToPlatform(platform.id, newChurchIds, dryRun);
    result.newLinksCreated = linkResult.created;
    result.errors = linkResult.errors;
  }
  
  const action = dryRun ? 'would link' : 'linked';
  console.log(`  ${platform.name}: ${result.churchesFound} churches found, ${result.newLinksCreated} ${action}, ${result.alreadyLinked} already linked`);
  
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const platformIndex = args.indexOf('--platform');
  const specificPlatformId = platformIndex >= 0 ? args[platformIndex + 1] : undefined;
  
  console.log('═'.repeat(60));
  console.log('           LINK CHURCHES TO CITY PLATFORMS');
  console.log('═'.repeat(60));
  console.log('');
  
  if (dryRun) {
    console.log('DRY RUN MODE - No changes will be made');
    console.log('');
  }
  
  const platforms = await getPlatforms(specificPlatformId);
  
  if (platforms.length === 0) {
    console.log('No active platforms found.');
    return;
  }
  
  console.log(`Processing ${platforms.length} platform(s)...`);
  console.log('');
  
  const results: LinkResult[] = [];
  let totalNew = 0;
  let totalFound = 0;
  let totalAlreadyLinked = 0;
  let totalErrors = 0;
  
  for (const platform of platforms) {
    const result = await processPlatform(platform, dryRun);
    results.push(result);
    totalNew += result.newLinksCreated;
    totalFound += result.churchesFound;
    totalAlreadyLinked += result.alreadyLinked;
    totalErrors += result.errors;
  }
  
  console.log('');
  console.log('═'.repeat(60));
  console.log('                        SUMMARY');
  console.log('═'.repeat(60));
  console.log('');
  console.log(`Platforms Processed:    ${platforms.length}`);
  console.log(`Churches Found Total:   ${totalFound.toLocaleString()}`);
  console.log(`Already Linked:         ${totalAlreadyLinked.toLocaleString()}`);
  console.log(`New Links ${dryRun ? '(would be) ' : ''}Created: ${totalNew.toLocaleString()}`);
  if (totalErrors > 0) {
    console.log(`Errors:                 ${totalErrors}`);
  }
  console.log('');
  console.log('═'.repeat(60));
}

export async function linkChurchesToPlatforms(options?: { platformId?: string; dryRun?: boolean }) {
  const platforms = await getPlatforms(options?.platformId);
  const results: LinkResult[] = [];
  
  for (const platform of platforms) {
    const result = await processPlatform(platform, options?.dryRun || false);
    results.push(result);
  }
  
  return {
    platformsProcessed: platforms.length,
    totalNewLinks: results.reduce((sum, r) => sum + r.newLinksCreated, 0),
    totalAlreadyLinked: results.reduce((sum, r) => sum + r.alreadyLinked, 0),
    totalErrors: results.reduce((sum, r) => sum + r.errors, 0),
    results,
  };
}

if (require.main === module) {
  main()
    .then(() => {
      console.log('\nScript completed successfully.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\nScript failed:', error);
      process.exit(1);
    });
}
