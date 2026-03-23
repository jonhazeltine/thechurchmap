import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";
import {
  searchChurchesNearby,
  generateGridPoints,
  deduplicateChurches,
  ChurchFromGoogle,
  ExistingChurchForDedup,
} from "../../../../../../server/services/google-places";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTERRUPTED_JOB_THRESHOLD_MINUTES = 10;

// In-memory tracking of active background processes to prevent duplicates
// Key: import job ID, Value: timestamp when started
const activeBackgroundJobs = new Map<string, number>();

// Parameters for the background import processing
interface ImportProcessingParams {
  importJobId: string;
  platformId: string;
  platformName: string;
  gridPoints: { lat: number; lng: number }[];
  startFromIndex: number;
  previousFoundCount: number;
  savedChurches: ChurchFromGoogle[] | null;
  searchAlreadyComplete: boolean;
  platformBoundaryIds: string[];
}

// Run import processing in the background (fire-and-forget)
async function runImportInBackground(params: ImportProcessingParams): Promise<void> {
  const {
    importJobId,
    platformId,
    platformName,
    gridPoints,
    startFromIndex,
    previousFoundCount,
    savedChurches,
    searchAlreadyComplete,
    platformBoundaryIds,
  } = params;
  
  // Check if this job is already being processed in memory
  if (activeBackgroundJobs.has(importJobId)) {
    const startedAt = activeBackgroundJobs.get(importJobId)!;
    const secondsAgo = (Date.now() - startedAt) / 1000;
    console.log(`[Import] BLOCKED: Job ${importJobId} is already being processed in memory (started ${secondsAgo.toFixed(0)}s ago)`);
    return;
  }
  
  // Register this job as active
  activeBackgroundJobs.set(importJobId, Date.now());
  console.log(`[Import] Registered job ${importJobId} as active (${activeBackgroundJobs.size} total active jobs)`);
  
  const adminClient = supabaseServer();
  
  try {
    console.log(`[Import] Background processing started for job ${importJobId}`);
    console.log(`[Import] ${gridPoints.length} grid points for search, starting from index ${startFromIndex}`);

    // If we loaded saved churches from a previous complete search, use them
    // Otherwise, run the search loop
    let allChurches: ChurchFromGoogle[] = savedChurches || [];
    const seenPlaceIds = new Set<string>();
    
    // Populate seenPlaceIds if resuming with saved churches
    if (savedChurches) {
      for (const church of savedChurches) {
        seenPlaceIds.add(church.google_place_id);
      }
    }

    let wasCancelled = false;
    const INCREMENTAL_SAVE_INTERVAL = 25; // Save churches to DB every 25 grid points
    
    // Skip search loop if search is already complete
    if (!searchAlreadyComplete) {
      for (let i = startFromIndex; i < gridPoints.length; i++) {
        const point = gridPoints[i];
        try {
          const churches = await searchChurchesNearby(point.lat, point.lng, 5000);
          
          for (const church of churches) {
            if (!seenPlaceIds.has(church.google_place_id)) {
              seenPlaceIds.add(church.google_place_id);
              allChurches.push(church);
            }
          }

          if ((i + 1) % 5 === 0 || i === gridPoints.length - 1) {
            // Check if job was cancelled/interrupted before updating progress
            const { data: jobStatus } = await adminClient
              .from('import_jobs')
              .select('status')
              .eq('id', importJobId)
              .single();
            
            if (jobStatus?.status !== 'running') {
              console.log(`[Import] Job ${importJobId} was cancelled (status: ${jobStatus?.status}), stopping at point ${i + 1}/${gridPoints.length}`);
              wasCancelled = true;
              break;
            }
            
            const totalFound = previousFoundCount + allChurches.length;
            
            // Save churches incrementally for resume capability
            const shouldSaveChurches = (i + 1) % INCREMENTAL_SAVE_INTERVAL === 0 || i === gridPoints.length - 1;
            
            const updatePayload: any = {
              grid_points_completed: i + 1,
              churches_found_raw: totalFound,
            };
            
            if (shouldSaveChurches) {
              updatePayload.churches_found_data = minimizeChurchData(allChurches);
            }
            
            const { error: updateError } = await adminClient
              .from('import_jobs')
              .update(updatePayload)
              .eq('id', importJobId);
            
            if (updateError) {
              console.error(`[Import] ERROR saving progress at point ${i + 1}:`, updateError.message);
              if (shouldSaveChurches) {
                const payloadSize = JSON.stringify(allChurches).length;
                console.error(`[Import] Payload size: ${(payloadSize / 1024).toFixed(1)} KB for ${allChurches.length} churches`);
              }
            } else if (shouldSaveChurches) {
              const payloadSize = JSON.stringify(allChurches).length;
              console.log(`[Import] Progress: ${i + 1}/${gridPoints.length} points, ${allChurches.length} churches SAVED (${(payloadSize / 1024).toFixed(1)} KB)`);
            } else {
              console.log(`[Import] Progress: ${i + 1}/${gridPoints.length} points, ${allChurches.length} churches`);
            }
          }

          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error: any) {
          console.error(`[Import] Error searching point ${i + 1}:`, error.message);
          if (error.message.includes('REQUEST_DENIED')) {
            await adminClient
              .from('import_jobs')
              .update({
                status: 'failed',
                error_message: 'Google Places API access denied. Please check your API key configuration.',
                grid_points_completed: i,
                churches_found_raw: allChurches.length,
              })
              .eq('id', importJobId);
            return;
          }
        }
      }
    }
    
    // If job was cancelled, exit early without processing churches
    if (wasCancelled) {
      console.log(`[Import] Job ${importJobId} exiting due to cancellation`);
      return;
    }

    console.log(`[Import] Total unique churches from Google: ${allChurches.length}`);
    
    // Final save of churches (in case search completed between interval saves)
    if (!searchAlreadyComplete && allChurches.length > 0) {
      const { error: finalSaveError } = await adminClient
        .from('import_jobs')
        .update({ churches_found_data: minimizeChurchData(allChurches) })
        .eq('id', importJobId);
      
      if (finalSaveError) {
        const payloadSize = JSON.stringify(allChurches).length;
        console.error(`[Import] ERROR on final save: ${finalSaveError.message} (${(payloadSize / 1024).toFixed(1)} KB)`);
      } else {
        const payloadSize = JSON.stringify(allChurches).length;
        console.log(`[Import] Final save: ${allChurches.length} churches to DB (${(payloadSize / 1024).toFixed(1)} KB)`);
      }
    }

    // Update phase to boundary checking
    await adminClient
      .from('import_jobs')
      .update({ current_phase: 'boundary_check' })
      .eq('id', importJobId);

    // Load any previously saved boundary check results for resume
    let previousResults: { place_id: string; in_bounds: boolean }[] = [];
    if (resume || searchAlreadyComplete) {
      const { data: jobData } = await adminClient
        .from('import_jobs')
        .select('boundary_check_results')
        .eq('id', importJobId)
        .single();
      previousResults = (jobData?.boundary_check_results as any[]) || [];
    }

    const checkedPlaceIds = new Set(previousResults.map((r: any) => r.place_id));
    const churchesInBoundaries: ChurchFromGoogle[] = previousResults
      .filter((r: any) => r.in_bounds)
      .map((r: any) => allChurches.find((c: any) => c.place_id === r.place_id))
      .filter(Boolean) as ChurchFromGoogle[];
    const churchesOutsideBoundaries: ChurchFromGoogle[] = previousResults
      .filter((r: any) => !r.in_bounds)
      .map((r: any) => allChurches.find((c: any) => c.place_id === r.place_id))
      .filter(Boolean) as ChurchFromGoogle[];

    const startIndex = checkedPlaceIds.size;
    const uncheckedChurches = allChurches.filter((c: any) => !checkedPlaceIds.has(c.place_id));

    console.log(`[Import] Checking boundary containment for ${uncheckedChurches.length} churches (${startIndex} already checked, resuming) against ${platformBoundaryIds.length} platform boundaries...`);

    let boundaryCheckFailures = 0;
    const BOUNDARY_UPDATE_INTERVAL = 20;
    const BOUNDARY_LOG_INTERVAL = 50;
    const BOUNDARY_SAVE_INTERVAL = 50;
    const boundaryResults = [...previousResults];

    for (let i = 0; i < uncheckedChurches.length; i++) {
      const church = uncheckedChurches[i];
      try {
        const { data: containingBoundaries, error: rpcError } = await adminClient.rpc(
          'fn_get_boundaries_for_church',
          { church_lat: church.latitude, church_lon: church.longitude }
        );

        if (rpcError) {
          console.warn(`[Import] Boundary check RPC error for "${church.name}": ${rpcError.message}`);
          boundaryCheckFailures++;
          churchesOutsideBoundaries.push(church);
          boundaryResults.push({ place_id: church.place_id, in_bounds: false });
          continue;
        }

        const containingBoundaryIds = (containingBoundaries || []).map((b: any) => b.id);
        const isInPlatformBoundary = platformBoundaryIds.some((pbId: string) =>
          containingBoundaryIds.includes(pbId)
        );

        if (isInPlatformBoundary) {
          churchesInBoundaries.push(church);
        } else {
          churchesOutsideBoundaries.push(church);
        }
        boundaryResults.push({ place_id: church.place_id, in_bounds: isInPlatformBoundary });

        const totalChecked = startIndex + i + 1;
        if (totalChecked % BOUNDARY_LOG_INTERVAL === 0) {
          console.log(`[Import] Boundary check progress: ${totalChecked}/${allChurches.length} (${churchesInBoundaries.length} in bounds, ${churchesOutsideBoundaries.length} out)`);
        }

        if ((i + 1) % BOUNDARY_UPDATE_INTERVAL === 0 || i === uncheckedChurches.length - 1) {
          const updatePayload: any = {
            churches_in_boundaries: churchesInBoundaries.length,
            churches_outside_boundaries: churchesOutsideBoundaries.length,
          };
          // Save full boundary results periodically for resume capability
          if ((i + 1) % BOUNDARY_SAVE_INTERVAL === 0 || i === uncheckedChurches.length - 1) {
            updatePayload.boundary_check_results = boundaryResults;
          }
          await adminClient
            .from('import_jobs')
            .update(updatePayload)
            .eq('id', importJobId);
        }
      } catch (error: any) {
        console.warn(`[Import] Boundary check failed for "${church.name}": ${error.message}`);
        boundaryCheckFailures++;
        churchesOutsideBoundaries.push(church);
        boundaryResults.push({ place_id: church.place_id, in_bounds: false });
      }
    }

    if (boundaryCheckFailures > 0) {
      console.warn(`[Import] ${boundaryCheckFailures} churches excluded due to boundary check failures (fail-closed)`);
    }

    console.log(`[Import] Boundary filter: ${churchesInBoundaries.length} inside boundaries, ${churchesOutsideBoundaries.length} outside (excluded)`);

    // Update phase to deduplication
    await adminClient
      .from('import_jobs')
      .update({ 
        current_phase: 'deduplication',
        churches_in_boundaries: churchesInBoundaries.length,
        churches_outside_boundaries: churchesOutsideBoundaries.length,
      })
      .eq('id', importJobId);

    const filteredChurches = churchesInBoundaries;

    const { data: existingChurches, error: existingError } = await adminClient
      .from('churches')
      .select('id, name, location, google_place_id, address');

    if (existingError) {
      console.error('Error fetching existing churches:', existingError);
    }

    const existingForDedup: ExistingChurchForDedup[] = (existingChurches || []).map((c: any) => {
      let lat = 0, lng = 0;
      if (c.location) {
        const match = c.location.toString().match(/POINT\(([^ ]+) ([^)]+)\)/);
        if (match) {
          lng = parseFloat(match[1]);
          lat = parseFloat(match[2]);
        }
      }
      return { 
        name: c.name, 
        latitude: lat, 
        longitude: lng,
        google_place_id: c.google_place_id || null,
        address: c.address || null,
      };
    });

    const withLocation = existingForDedup.filter((c: any) => c.latitude !== 0 && c.longitude !== 0);
    const withPlaceId = existingForDedup.filter((c: any) => c.google_place_id);
    
    console.log(`[Import] Existing churches for dedup: ${existingForDedup.length} total, ${withLocation.length} with location, ${withPlaceId.length} with google_place_id`);

    const { unique, duplicates } = deduplicateChurches(filteredChurches, existingForDedup);
    console.log(`[Import] Deduplication: ${unique.length} new, ${duplicates.length} duplicates`);

    // Update phase to inserting
    await adminClient
      .from('import_jobs')
      .update({ 
        current_phase: 'inserting',
        duplicates_skipped: duplicates.length,
      })
      .eq('id', importJobId);

    let insertedCount = 0;
    let linkedCount = 0;
    const errors: string[] = [];
    const INSERT_UPDATE_INTERVAL = 10;

    for (let i = 0; i < unique.length; i++) {
      const church = unique[i];
      try {
        const locationEWKT = `SRID=4326;POINT(${church.longitude} ${church.latitude})`;

        const addressScore = church.address ? 100 : 0;
        const contactScore = (church.phone ? 40 : 0) + (church.website ? 35 : 0);
        const dataQualityScore = Math.round(addressScore * 0.4 + contactScore * 0.3);

        const { data: insertedChurch, error: insertError } = await adminClient
          .from('churches')
          .insert({
            name: church.name,
            address: church.address,
            city: church.city,
            state: church.state,
            zip: church.zip,
            location: locationEWKT,
            website: church.website || null,
            phone: church.phone || null,
            source: 'google_places',
            approved: false,
            google_place_id: church.google_place_id,
            google_match_confidence: 1.0,
            google_last_checked_at: new Date().toISOString(),
            verification_status: 'verified',
            last_verified_at: new Date().toISOString(),
            last_verified_source: 'google_places',
            data_quality_score: dataQualityScore,
            data_quality_breakdown: {
              address_location: addressScore,
              contact: contactScore,
              metadata: 0,
            },
          })
          .select('id')
          .single();

        if (insertError) {
          if (insertError.code === '23505') {
            continue;
          }
          throw insertError;
        }

        insertedCount++;

        const { data: boundaryIds } = await adminClient.rpc(
          'fn_get_boundaries_for_church',
          { church_lat: church.latitude, church_lon: church.longitude }
        );

        if (boundaryIds && boundaryIds.length > 0) {
          const placeIds = boundaryIds.map((b: any) => b.id);
          await adminClient
            .from('churches')
            .update({ boundary_ids: placeIds })
            .eq('id', insertedChurch.id);
        }

        const { error: linkError } = await adminClient
          .from('city_platform_churches')
          .upsert({
            city_platform_id: platformId,
            church_id: insertedChurch.id,
            status: 'pending',
          }, {
            onConflict: 'city_platform_id,church_id',
            ignoreDuplicates: true,
          });

        if (!linkError) {
          linkedCount++;
          // Mark church as managed by platform for tileset filtering
          await adminClient
            .from('churches')
            .update({ managed_by_platform: true })
            .eq('id', insertedChurch.id);
        }
        
        if ((i + 1) % INSERT_UPDATE_INTERVAL === 0 || i === unique.length - 1) {
          await adminClient
            .from('import_jobs')
            .update({
              churches_inserted: insertedCount,
              churches_linked: linkedCount,
            })
            .eq('id', importJobId);
        }

      } catch (error: any) {
        errors.push(`${church.name}: ${error.message}`);
        console.error(`[Import] Error inserting ${church.name}:`, error.message);
      }
    }

    console.log(`[Import] Complete: ${insertedCount} inserted, ${linkedCount} linked to platform`);

    await adminClient
      .from('import_jobs')
      .update({
        status: 'completed',
        current_phase: 'completed',
        completed_at: new Date().toISOString(),
        churches_in_boundaries: churchesInBoundaries.length,
        churches_outside_boundaries: churchesOutsideBoundaries.length,
        duplicates_skipped: duplicates.length,
        churches_inserted: insertedCount,
        churches_linked: linkedCount,
      })
      .eq('id', importJobId);

    console.log(`[Import] Background processing completed for job ${importJobId}`);
    
  } catch (error: any) {
    console.error(`[Import] Background processing error for job ${importJobId}:`, error);
    
    await adminClient
      .from('import_jobs')
      .update({
        status: 'failed',
        current_phase: 'failed',
        error_message: error.message || 'Internal server error',
      })
      .eq('id', importJobId);
  } finally {
    // Always remove job from active tracking when done (success, failure, or cancellation)
    activeBackgroundJobs.delete(importJobId);
    console.log(`[Import] Unregistered job ${importJobId} from active tracking (${activeBackgroundJobs.size} remaining)`);
  }
}

// Minimize church data for storage - reduces payload size by ~40%
function minimizeChurchData(churches: ChurchFromGoogle[]): any[] {
  return churches.map(c => ({
    google_place_id: c.google_place_id,
    name: c.name,
    address: c.address,
    latitude: c.latitude,
    longitude: c.longitude,
    city: c.city,
    state: c.state,
    zip: c.zip,
  }));
}

function extractCoordinates(geometry: any): [number, number][] {
  const coords: [number, number][] = [];
  
  function traverse(item: any) {
    if (Array.isArray(item)) {
      if (item.length >= 2 && typeof item[0] === 'number' && typeof item[1] === 'number') {
        coords.push([item[0], item[1]]);
      } else {
        for (const subItem of item) {
          traverse(subItem);
        }
      }
    } else if (item && typeof item === 'object') {
      if (item.coordinates) {
        traverse(item.coordinates);
      }
    }
  }
  
  traverse(geometry);
  return coords;
}

async function resolvePlatformId(
  supabase: ReturnType<typeof supabaseServer>,
  platformIdOrSlug: string
): Promise<{ id: string; name: string } | null> {
  if (UUID_REGEX.test(platformIdOrSlug)) {
    const { data } = await supabase
      .from('city_platforms')
      .select('id, name')
      .eq('id', platformIdOrSlug)
      .single();
    return data;
  }
  
  const { data } = await supabase
    .from('city_platforms')
    .select('id, name')
    .eq('slug', platformIdOrSlug)
    .single();
  return data;
}

async function checkPlatformAccess(
  adminClient: ReturnType<typeof supabaseServer>,
  userId: string,
  platformId: string,
  userMetadata: any
): Promise<{ hasAccess: boolean; isSuperAdmin: boolean }> {
  const isSuperAdmin = userMetadata?.super_admin === true;
  
  if (isSuperAdmin) {
    return { hasAccess: true, isSuperAdmin: true };
  }

  // Only platform owners can use Google import (not platform admins) due to API costs
  const { data: userRole } = await adminClient
    .from('city_platform_users')
    .select('role')
    .eq('city_platform_id', platformId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('role', 'platform_owner')
    .single();

  return { hasAccess: !!userRole, isSuperAdmin: false };
}

async function markOldRunningJobsAsInterrupted(
  adminClient: ReturnType<typeof supabaseServer>,
  platformId: string
): Promise<number> {
  const cutoffTime = new Date(Date.now() - INTERRUPTED_JOB_THRESHOLD_MINUTES * 60 * 1000).toISOString();
  
  const { data, error } = await adminClient
    .from('import_jobs')
    .update({ status: 'interrupted' })
    .eq('city_platform_id', platformId)
    .eq('status', 'running')
    .lt('started_at', cutoffTime)
    .select('id');
  
  if (error) {
    console.warn('[Import] Error marking old jobs as interrupted:', error.message);
    return 0;
  }
  
  return data?.length || 0;
}

export async function GET(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id: platformIdOrSlug } = req.params;

    const platform = await resolvePlatformId(adminClient, platformIdOrSlug);
    if (!platform) {
      return res.status(404).json({ error: 'Platform not found' });
    }
    const platformId = platform.id;

    const { hasAccess } = await checkPlatformAccess(
      adminClient,
      user.id,
      platformId,
      user.user_metadata
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this platform' });
    }

    await markOldRunningJobsAsInterrupted(adminClient, platformId);

    // Try fetching with current_phase first, fallback without it if column doesn't exist
    let importJobs: any[] = [];
    let fetchError: any = null;
    
    const { data: jobsWithPhase, error: phaseError } = await adminClient
      .from('import_jobs')
      .select(`
        id,
        status,
        current_phase,
        grid_points_total,
        grid_points_completed,
        churches_found_raw,
        churches_in_boundaries,
        churches_outside_boundaries,
        duplicates_skipped,
        churches_inserted,
        churches_linked,
        started_at,
        completed_at,
        error_message,
        user_id
      `)
      .eq('city_platform_id', platformId)
      .order('started_at', { ascending: false })
      .limit(10);
    
    if (phaseError && phaseError.code === '42703') {
      // Column doesn't exist, fetch without it and add default
      const { data: jobsWithoutPhase, error: fallbackError } = await adminClient
        .from('import_jobs')
        .select(`
          id,
          status,
          grid_points_total,
          grid_points_completed,
          churches_found_raw,
          churches_in_boundaries,
          churches_outside_boundaries,
          duplicates_skipped,
          churches_inserted,
          churches_linked,
          started_at,
          completed_at,
          error_message,
          user_id
        `)
        .eq('city_platform_id', platformId)
        .order('started_at', { ascending: false })
        .limit(10);
      
      fetchError = fallbackError;
      importJobs = (jobsWithoutPhase || []).map(job => ({
        ...job,
        current_phase: job.status === 'completed' ? 'completed' : job.status === 'failed' ? 'failed' : 'searching'
      }));
    } else {
      fetchError = phaseError;
      importJobs = jobsWithPhase || [];
    }

    if (fetchError) {
      console.error('Error fetching import jobs:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch import history' });
    }

    // Get the current running job (prioritize running over interrupted)
    // First try to find a running job, then fall back to interrupted
    let incompleteJob: any = null;
    
    // First look for a running job
    const { data: runningJob, error: runningError } = await adminClient
      .from('import_jobs')
      .select('id, status, current_phase, grid_points_completed, grid_points_total, churches_found_raw, started_at, error_message')
      .eq('city_platform_id', platformId)
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();
    
    if (runningJob && !runningError) {
      incompleteJob = runningJob;
    } else {
      // No running job, look for interrupted job that can be resumed
      const { data: interruptedJob, error: interruptedError } = await adminClient
        .from('import_jobs')
        .select('id, status, current_phase, grid_points_completed, grid_points_total, churches_found_raw, started_at, error_message')
        .eq('city_platform_id', platformId)
        .eq('status', 'interrupted')
        .order('started_at', { ascending: false })
        .limit(1)
        .single();
      
      if (interruptedJob && !interruptedError) {
        incompleteJob = interruptedJob;
      }
    }

    return res.status(200).json({
      success: true,
      importJobs: importJobs || [],
      incompleteJob: incompleteJob || null,
    });

  } catch (error: any) {
    console.error('Error in GET /api/admin/city-platforms/:id/import-churches:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export async function POST(req: Request, res: Response) {
  let importJobId: string | null = null;
  let adminClient: ReturnType<typeof supabaseServer> | null = null;
  
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id: platformIdOrSlug } = req.params;
    const { resume, startFresh } = req.body || {};

    const platform = await resolvePlatformId(adminClient, platformIdOrSlug);
    if (!platform) {
      return res.status(404).json({ error: 'Platform not found' });
    }
    const platformId = platform.id;

    const { hasAccess } = await checkPlatformAccess(
      adminClient,
      user.id,
      platformId,
      user.user_metadata
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this platform' });
    }

    const markedInterrupted = await markOldRunningJobsAsInterrupted(adminClient, platformId);
    if (markedInterrupted > 0) {
      console.log(`[Import] Marked ${markedInterrupted} old running jobs as interrupted`);
    }

    const { data: existingIncompleteJob } = await adminClient
      .from('import_jobs')
      .select('*')
      .eq('city_platform_id', platformId)
      .in('status', ['running', 'interrupted'])
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (existingIncompleteJob && !resume && !startFresh) {
      return res.status(409).json({
        error: 'incomplete_import_exists',
        message: `An incomplete import job exists (${existingIncompleteJob.grid_points_completed}/${existingIncompleteJob.grid_points_total} grid points completed). Please resume or start fresh.`,
        incompleteJob: {
          id: existingIncompleteJob.id,
          status: existingIncompleteJob.status,
          gridPointsCompleted: existingIncompleteJob.grid_points_completed,
          gridPointsTotal: existingIncompleteJob.grid_points_total,
          churchesFoundRaw: existingIncompleteJob.churches_found_raw,
          startedAt: existingIncompleteJob.started_at,
        },
      });
    }

    // CONCURRENCY GUARD: Prevent overlapping imports
    // Check both started_at (for new jobs) and updated_at (for actively running jobs)
    if (existingIncompleteJob && existingIncompleteJob.status === 'running') {
      const now = Date.now();
      const jobStartedAt = new Date(existingIncompleteJob.started_at).getTime();
      const secondsSinceStart = (now - jobStartedAt) / 1000;
      
      // Also check updated_at - if job was updated recently, it's actively running
      const jobUpdatedAt = existingIncompleteJob.updated_at 
        ? new Date(existingIncompleteJob.updated_at).getTime() 
        : jobStartedAt;
      const secondsSinceUpdate = (now - jobUpdatedAt) / 1000;
      
      // Block if started recently OR updated recently (actively running)
      if (secondsSinceStart < 60 || secondsSinceUpdate < 30) {
        console.log(`[Import] BLOCKED: Job ${existingIncompleteJob.id} is actively running (started ${secondsSinceStart.toFixed(0)}s ago, last update ${secondsSinceUpdate.toFixed(0)}s ago)`);
        return res.status(409).json({
          error: 'import_already_running',
          message: 'An import is already in progress. Please wait for it to complete or check the progress.',
          incompleteJob: {
            id: existingIncompleteJob.id,
            status: existingIncompleteJob.status,
            gridPointsCompleted: existingIncompleteJob.grid_points_completed,
            gridPointsTotal: existingIncompleteJob.grid_points_total,
            churchesFoundRaw: existingIncompleteJob.churches_found_raw,
            startedAt: existingIncompleteJob.started_at,
          },
        });
      }
    }

    if (startFresh && existingIncompleteJob) {
      await adminClient
        .from('import_jobs')
        .update({ status: 'interrupted', error_message: 'Cancelled by user starting fresh import' })
        .eq('id', existingIncompleteJob.id);
      console.log(`[Import] Marked existing job ${existingIncompleteJob.id} as interrupted (user started fresh)`);
    }

    console.log(`[Import] Starting Google Places import for platform: ${platform.name}${resume ? ' (RESUMING)' : ''}`);

    const { data: platformBoundaries, error: boundaryError } = await adminClient
      .from('city_platform_boundaries')
      .select(`
        boundary_id,
        boundaries:boundary_id (
          id,
          name,
          type,
          geometry
        )
      `)
      .eq('city_platform_id', platformId);

    if (boundaryError) {
      console.error('Error fetching platform boundaries:', boundaryError);
      return res.status(500).json({ error: 'Failed to fetch platform boundaries' });
    }

    if (!platformBoundaries || platformBoundaries.length === 0) {
      return res.status(400).json({ 
        error: 'Platform has no boundaries defined. Please add boundaries first.' 
      });
    }

    let minLat: number, maxLat: number, minLng: number, maxLng: number;
    let gridPoints: { lat: number; lng: number }[];
    let startFromIndex = 0;
    let previousFoundCount = 0; // Track churches found in previous session for resume

    // Track if we're resuming with search already complete (skip to post-search phases)
    let savedChurches: ChurchFromGoogle[] | null = null;
    let searchAlreadyComplete = false;
    
    if (resume && existingIncompleteJob) {
      importJobId = existingIncompleteJob.id;
      
      const bbox = existingIncompleteJob.bounding_box as any;
      minLat = bbox.min_lat;
      maxLat = bbox.max_lat;
      minLng = bbox.min_lng;
      maxLng = bbox.max_lng;
      
      gridPoints = existingIncompleteJob.grid_points_data as { lat: number; lng: number }[];
      startFromIndex = existingIncompleteJob.grid_points_completed;
      previousFoundCount = existingIncompleteJob.churches_found_raw || 0;
      
      // Check if search is already complete - if so, load saved churches
      if (startFromIndex >= gridPoints.length) {
        searchAlreadyComplete = true;
        if (existingIncompleteJob.churches_found_data) {
          savedChurches = existingIncompleteJob.churches_found_data as ChurchFromGoogle[];
          console.log(`[Import] Search already complete, loaded ${savedChurches.length} saved churches for post-search processing`);
          
          // Determine which phase to resume from based on current_phase
          // Reset started_at to prevent being marked as stale by the polling GET endpoint
          // IMPORTANT: Preserve grid_points values so UI shows search is complete
          const resumePhase = existingIncompleteJob.current_phase || 'boundary_check';
          await adminClient
            .from('import_jobs')
            .update({ 
              status: 'running', 
              current_phase: resumePhase, 
              started_at: new Date().toISOString(),
              grid_points_completed: existingIncompleteJob.grid_points_completed,
              grid_points_total: gridPoints.length,
              churches_found_raw: savedChurches.length,
            })
            .eq('id', importJobId);
        } else {
          // Search is complete but no saved data exists (pre-migration job or failed save)
          // User must start fresh to avoid losing the search results
          console.warn(`[Import] Job ${importJobId} has completed search but no saved churches data. User must start fresh.`);
          return res.status(409).json({
            error: 'resume_data_missing',
            message: 'This import completed its search phase but the church data was not saved (pre-migration job). Please click "Start Fresh" to re-run the import.',
            incompleteJob: {
              id: existingIncompleteJob.id,
              status: existingIncompleteJob.status,
              gridPointsCompleted: existingIncompleteJob.grid_points_completed,
              gridPointsTotal: existingIncompleteJob.grid_points_total,
              churchesFoundRaw: existingIncompleteJob.churches_found_raw,
              startedAt: existingIncompleteJob.started_at,
            },
          });
        }
      } else {
        // Search is not complete, resuming mid-search
        // Load any previously saved churches from prior sessions
        if (existingIncompleteJob.churches_found_data) {
          savedChurches = existingIncompleteJob.churches_found_data as ChurchFromGoogle[];
          // Reset previousFoundCount to 0 since allChurches will contain savedChurches
          // This prevents double-counting in the progress updates
          previousFoundCount = 0;
          console.log(`[Import] Loaded ${savedChurches.length} previously found churches for continuation`);
        } else if (startFromIndex > 0) {
          // CRITICAL: Cannot resume mid-search without saved church data
          // This would cause all churches from grid points 0 to startFromIndex to be lost
          console.error(`[Import] BLOCKED: Job ${importJobId} at point ${startFromIndex}/${gridPoints.length} has no saved churches. Would lose data!`);
          return res.status(409).json({
            error: 'resume_data_missing',
            message: `Cannot resume this import - church data from the first ${startFromIndex} grid points was not saved (pre-migration job). Please click "Start Fresh" to re-run the import.`,
            incompleteJob: {
              id: existingIncompleteJob.id,
              status: existingIncompleteJob.status,
              gridPointsCompleted: existingIncompleteJob.grid_points_completed,
              gridPointsTotal: existingIncompleteJob.grid_points_total,
              churchesFoundRaw: existingIncompleteJob.churches_found_raw,
              startedAt: existingIncompleteJob.started_at,
            },
          });
        }
        
        // Reset started_at to prevent being marked as stale by the polling GET endpoint
        await adminClient
          .from('import_jobs')
          .update({ status: 'running', current_phase: 'searching', started_at: new Date().toISOString() })
          .eq('id', importJobId);
        
        console.log(`[Import] Resuming from grid point ${startFromIndex + 1}/${gridPoints.length}, savedChurches: ${savedChurches?.length || 0}`);
      }
    } else {
      const { data: boundingBoxData, error: bboxError } = await adminClient.rpc(
        'fn_get_platform_bounding_box',
        { platform_id: platformId }
      );

      if (bboxError || !boundingBoxData) {
        console.log('[Import] Bounding box RPC not available, calculating from boundaries via GeoJSON');
        
        const boundaryIds = platformBoundaries.map((pb: any) => pb.boundary_id);
        const { data: boundaryGeojson, error: geojsonError } = await adminClient.rpc(
          'fn_get_boundaries_geojson',
          { boundary_ids: boundaryIds }
        );
        
        if (!geojsonError && boundaryGeojson && boundaryGeojson.length > 0) {
          let allMinLat = 90, allMaxLat = -90, allMinLng = 180, allMaxLng = -180;
          
          for (const b of boundaryGeojson) {
            if (b.geometry) {
              const coords = extractCoordinates(b.geometry);
              for (const [lng, lat] of coords) {
                if (lat < allMinLat) allMinLat = lat;
                if (lat > allMaxLat) allMaxLat = lat;
                if (lng < allMinLng) allMinLng = lng;
                if (lng > allMaxLng) allMaxLng = lng;
              }
            }
          }
          
          if (allMinLat < 90) {
            minLat = allMinLat;
            maxLat = allMaxLat;
            minLng = allMinLng;
            maxLng = allMaxLng;
            console.log(`[Import] Calculated bounding box from ${boundaryGeojson.length} boundary geometries`);
          } else {
            return res.status(400).json({ 
              error: 'Unable to extract coordinates from platform boundaries. Please ensure boundaries have valid geometry.' 
            });
          }
        } else {
          console.log('[Import] GeoJSON RPC failed, trying platform center coordinates');
          const { data: platformData } = await adminClient
            .from('city_platforms')
            .select('center_lat, center_lng')
            .eq('id', platformId)
            .single();

          if (!platformData?.center_lat || !platformData?.center_lng) {
            return res.status(400).json({ 
              error: 'Platform has no center coordinates and boundary geometry could not be retrieved.' 
            });
          }
          
          const radiusKm = 25;
          const latOffset = radiusKm / 111;
          const lngOffset = radiusKm / (111 * Math.cos(platformData.center_lat * Math.PI / 180));

          minLat = platformData.center_lat - latOffset;
          maxLat = platformData.center_lat + latOffset;
          minLng = platformData.center_lng - lngOffset;
          maxLng = platformData.center_lng + lngOffset;
        }
      } else {
        minLat = boundingBoxData.min_lat;
        maxLat = boundingBoxData.max_lat;
        minLng = boundingBoxData.min_lng;
        maxLng = boundingBoxData.max_lng;
      }

      gridPoints = generateGridPoints(minLat, maxLat, minLng, maxLng, 4);

      const { data: newJob, error: createJobError } = await adminClient
        .from('import_jobs')
        .insert({
          city_platform_id: platformId,
          user_id: user.id,
          status: 'running',
          current_phase: 'searching',
          grid_points_total: gridPoints.length,
          grid_points_completed: 0,
          grid_points_data: gridPoints,
          bounding_box: { min_lat: minLat, max_lat: maxLat, min_lng: minLng, max_lng: maxLng },
          churches_found_raw: 0,
        })
        .select('id')
        .single();

      if (createJobError || !newJob) {
        console.error('Error creating import job:', createJobError);
        return res.status(500).json({ error: 'Failed to create import job' });
      }

      importJobId = newJob.id;
      console.log(`[Import] Created import job ${importJobId}`);
    }

    // Extract platform boundary IDs for background processing
    const platformBoundaryIds = platformBoundaries.map((pb: any) => pb.boundary_id);

    // Start background processing (fire-and-forget)
    // This allows the POST to return immediately while import runs in background
    runImportInBackground({
      importJobId: importJobId!,
      platformId,
      platformName: platform.name,
      gridPoints,
      startFromIndex,
      previousFoundCount,
      savedChurches,
      searchAlreadyComplete,
      platformBoundaryIds,
    }).catch((err) => {
      console.error(`[Import] Background processing failed for job ${importJobId}:`, err);
    });

    // Return immediately with job ID - frontend will poll GET for progress
    console.log(`[Import] Returning immediately, background processing started for job ${importJobId}`);
    return res.status(200).json({
      success: true,
      importJobId,
      message: 'Import started. Progress will be updated in real-time.',
      backgroundProcessing: true,
    });

  } catch (error: any) {
    console.error('Error in POST /api/admin/city-platforms/:id/import-churches:', error);
    
    if (importJobId && adminClient) {
      await adminClient
        .from('import_jobs')
        .update({
          status: 'failed',
          current_phase: 'failed',
          error_message: error.message || 'Internal server error',
        })
        .eq('id', importJobId);
    }
    
    return res.status(500).json({ error: error.message || 'Internal server error', importJobId });
  }
}

export async function DELETE(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id: platformIdOrSlug } = req.params;

    const platform = await resolvePlatformId(adminClient, platformIdOrSlug);
    if (!platform) {
      return res.status(404).json({ error: 'Platform not found' });
    }
    const platformId = platform.id;

    const { hasAccess } = await checkPlatformAccess(
      adminClient,
      user.id,
      platformId,
      user.user_metadata
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this platform' });
    }

    console.log(`[Import] Clearing pending Google Places imports for platform: ${platform.name}`);

    // Step 1: Get pending church links for this platform
    const { data: pendingLinks, error: linksError } = await adminClient
      .from('city_platform_churches')
      .select('church_id')
      .eq('city_platform_id', platformId)
      .eq('status', 'pending');

    if (linksError) {
      console.error('Error fetching pending links:', linksError);
      return res.status(500).json({ error: 'Failed to fetch pending church links' });
    }

    const pendingChurchIds = pendingLinks?.map((lc: any) => lc.church_id) || [];
    
    if (pendingChurchIds.length === 0) {
      return res.status(200).json({
        success: true,
        deleted: 0,
        message: 'No pending imports found to delete.',
      });
    }

    // Step 2: Filter to only Google Places imports that are unapproved
    const { data: googleChurches, error: fetchError } = await adminClient
      .from('churches')
      .select('id')
      .in('id', pendingChurchIds)
      .eq('source', 'google_places')
      .eq('approved', false);

    if (fetchError) {
      console.error('Error fetching Google Places churches:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch churches to delete' });
    }

    const churchIds = googleChurches?.map((c: any) => c.id) || [];
    console.log(`[Import] Found ${churchIds.length} pending Google Places churches to remove (from ${pendingChurchIds.length} total pending)`);

    if (churchIds.length === 0) {
      return res.status(200).json({
        success: true,
        deleted: 0,
        message: 'No pending Google Places imports found to delete. Approved churches are protected.',
      });
    }

    const { error: unlinkError } = await adminClient
      .from('city_platform_churches')
      .delete()
      .eq('city_platform_id', platformId)
      .eq('status', 'pending')
      .in('church_id', churchIds);

    if (unlinkError) {
      console.error('Error unlinking churches:', unlinkError);
      return res.status(500).json({ error: 'Failed to unlink churches from platform' });
    }

    const { error: deleteError } = await adminClient
      .from('churches')
      .delete()
      .in('id', churchIds)
      .eq('source', 'google_places')
      .eq('approved', false);

    if (deleteError) {
      console.error('Error deleting churches:', deleteError);
      return res.status(500).json({ error: 'Failed to delete churches' });
    }

    console.log(`[Import] Cleared ${churchIds.length} pending Google Places churches from platform`);

    return res.status(200).json({
      success: true,
      deleted: churchIds.length,
      message: `Successfully deleted ${churchIds.length} pending imports. Approved churches were preserved.`,
    });

  } catch (error: any) {
    console.error('Error in DELETE /api/admin/city-platforms/:id/import-churches:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

// PATCH - Cancel/dismiss an interrupted import job (does NOT delete any churches)
export async function PATCH(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id: platformIdOrSlug } = req.params;
    const { jobId, action } = req.body;

    if (action !== 'cancel' && action !== 'dismiss') {
      return res.status(400).json({ error: 'Invalid action. Use "cancel" or "dismiss".' });
    }

    const platform = await resolvePlatformId(adminClient, platformIdOrSlug);
    if (!platform) {
      return res.status(404).json({ error: 'Platform not found' });
    }
    const platformId = platform.id;

    const { hasAccess } = await checkPlatformAccess(
      adminClient,
      user.id,
      platformId,
      user.user_metadata
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this platform' });
    }

    console.log(`[Import] ${action === 'cancel' ? 'Cancelling' : 'Dismissing'} import job for platform: ${platform.name}`);

    // If jobId is provided, cancel that specific job
    // Otherwise, cancel/dismiss all interrupted jobs for this platform
    if (jobId) {
      const { data: job, error: jobError } = await adminClient
        .from('import_jobs')
        .select('id, status')
        .eq('id', jobId)
        .eq('city_platform_id', platformId)
        .single();

      if (jobError || !job) {
        return res.status(404).json({ error: 'Import job not found' });
      }

      const { error: updateError } = await adminClient
        .from('import_jobs')
        .update({ status: 'failed', error_message: 'Dismissed by user' })
        .eq('id', jobId);

      if (updateError) {
        console.error('Error dismissing job:', updateError);
        return res.status(500).json({ error: 'Failed to dismiss import job' });
      }

      console.log(`[Import] Dismissed job ${jobId}`);
      return res.status(200).json({
        success: true,
        message: 'Import job dismissed. Your pending churches are preserved.',
      });
    } else {
      // Dismiss all interrupted jobs for this platform
      const { data: jobs, error: fetchError } = await adminClient
        .from('import_jobs')
        .update({ status: 'failed', error_message: 'Dismissed by user' })
        .eq('city_platform_id', platformId)
        .in('status', ['interrupted', 'running'])
        .select('id');

      if (fetchError) {
        console.error('Error dismissing jobs:', fetchError);
        return res.status(500).json({ error: 'Failed to dismiss import jobs' });
      }

      const count = jobs?.length || 0;
      console.log(`[Import] Dismissed ${count} interrupted/running jobs for platform`);
      return res.status(200).json({
        success: true,
        dismissed: count,
        message: count > 0 
          ? `Dismissed ${count} import job(s). Your pending churches are preserved.`
          : 'No active or interrupted import jobs to dismiss.',
      });
    }

  } catch (error: any) {
    console.error('Error in PATCH /api/admin/city-platforms/:id/import-churches:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
