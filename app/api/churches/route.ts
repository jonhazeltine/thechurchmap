import type { Request, Response } from "express";
import { supabaseServer } from "../../../lib/supabaseServer";
import { insertChurchSchema } from "@shared/schema";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ChurchFetchParams {
  cityPlatformId: string | undefined;
  regionId: string | undefined;
  searchTerm: string | undefined;
  collabHave: string | undefined;
  collabNeed: string | undefined;
}

/**
 * In-flight request dedupe for /api/churches.
 *
 * Identical concurrent requests (same normalized filter params) share a
 * single Promise. Second+ callers await the original and respond from its
 * result — so a thundering herd of N duplicate requests only runs one DB
 * workload and only holds one result in memory.
 *
 * Background: a hover-prefetch in PlatformSwitcher used to fire 6+ parallel
 * full /api/churches?city_platform_id=X fetches whenever a super-admin
 * opened the platform dropdown. Each fetch buffered thousands of church
 * rows + images + callings into Node's heap at once, reliably OOM-killing
 * the process on Railway. That prefetch is now gone — this dedupe is kept
 * as a safety net for any other code path (React Query retries, StrictMode
 * double-mounts, concurrent tabs) that might issue identical requests.
 */
const inFlightChurchRequests = new Map<string, Promise<any[]>>();

export async function GET(req: Request, res: Response) {
  try {
    const supabase = supabaseServer();

    // Extract query parameters for filtering
    const searchTerm = req.query.search as string | undefined;
    const collabHave = req.query.collab_have as string | undefined;
    const collabNeed = req.query.collab_need as string | undefined;
    let cityPlatformId = req.query.city_platform_id as string | undefined;
    const regionId = req.query.region_id as string | undefined; // Region filtering

    // Resolve platform slug to UUID if needed
    if (cityPlatformId && !UUID_REGEX.test(cityPlatformId)) {
      const { data: platform, error: slugError } = await supabase
        .from('city_platforms')
        .select('id')
        .eq('slug', cityPlatformId)
        .single();

      if (slugError || !platform) {
        console.warn(`Could not resolve platform slug "${cityPlatformId}":`, slugError?.message);
        return res.json([]);
      }
      console.log(`🔄 Resolved platform slug "${cityPlatformId}" to UUID "${platform.id}"`);
      cityPlatformId = platform.id;
    }

    const params: ChurchFetchParams = {
      cityPlatformId,
      regionId,
      searchTerm,
      collabHave,
      collabNeed,
    };

    // Build dedupe key AFTER slug resolution so slug and UUID requests for
    // the same platform coalesce into one.
    const dedupeKey = JSON.stringify(params);

    let pending = inFlightChurchRequests.get(dedupeKey);
    if (pending) {
      console.log(`🔁 Coalescing /api/churches request: ${dedupeKey}`);
    } else {
      pending = fetchFilteredChurches(params).finally(() => {
        inFlightChurchRequests.delete(dedupeKey);
      });
      inFlightChurchRequests.set(dedupeKey, pending);
    }

    const result = await pending;
    res.json(result);
  } catch (error: any) {
    console.error('GET /api/churches error:', error);
    res.status(500).json({ error: error.message, details: error });
  }
}

async function fetchFilteredChurches(params: ChurchFetchParams): Promise<any[]> {
  const { cityPlatformId, regionId, searchTerm, collabHave, collabNeed } = params;
  const supabase = supabaseServer();

  // Phase 5C: Platform context filtering
  // When city_platform_id is provided, use a DIRECT approach to get ALL platform churches
  // This avoids the 10k global limit issue that was causing churches to be missing
  let platformChurchIds: Set<string> | null = null;
  let churchesRaw: any[] = [];
  let enabledCountyFips = new Set<string>();
  let displayLdsChurches = false; // Default to hiding LDS churches unless platform explicitly enables them
  let displayJwChurches = false; // Default to hiding Jehovah's Witness churches unless platform explicitly enables them

  // OPTIMIZATION: If region filter is specified, get region church IDs FIRST
  // This allows us to fetch only the churches we need instead of all platform churches
  let regionChurchIds: Set<string> | null = null;
  if (regionId && cityPlatformId) {
    const startTime = Date.now();
    console.log(`🚀 Early region filter: getting church IDs for region ${regionId}`);

    // Get the boundary IDs for this region
    const { data: regionBoundaries, error: regionError } = await supabase
      .from('region_boundaries')
      .select('boundary_id')
      .eq('region_id', regionId);

    if (!regionError && regionBoundaries && regionBoundaries.length > 0) {
      const regionBoundaryIds = regionBoundaries.map(rb => rb.boundary_id);

      // Use spatial query to find churches within these boundaries
      const { data: churchesInRegion, error: spatialError } = await supabase.rpc(
        'fn_churches_within_boundaries',
        { p_boundary_ids: regionBoundaryIds }
      );

      if (!spatialError && churchesInRegion) {
        regionChurchIds = new Set(churchesInRegion.map((c: any) => c.church_id));
        console.log(`🚀 Region ${regionId} has ${regionChurchIds.size} churches (${Date.now() - startTime}ms)`);
      }
    }
  }

  if (cityPlatformId) {
    // PLATFORM VIEW: Fetch churches directly via platform link
    // This gets ALL churches linked to the platform, no limit issues
    console.log(`🏙️ Platform view: fetching churches for platform ${cityPlatformId}`);

    // Fetch platform settings to check LDS and JW display preferences
    const { data: platformData, error: platformSettingsError } = await supabase
      .from('city_platforms')
      .select('display_lds_churches, display_jw_churches')
      .eq('id', cityPlatformId)
      .single();

    if (platformSettingsError) {
      console.warn('Could not fetch platform settings for church filters:', platformSettingsError.message);
    } else if (platformData) {
      displayLdsChurches = platformData.display_lds_churches ?? false;
      displayJwChurches = platformData.display_jw_churches ?? false;
      console.log(`🏛️ Platform display settings - LDS: ${displayLdsChurches}, JW: ${displayJwChurches}`);
    }

    // First get the linked church IDs
    const { data: platformChurches, error: platformError } = await supabase
      .from('city_platform_churches')
      .select('church_id')
      .eq('city_platform_id', cityPlatformId)
      .in('status', ['visible', 'featured']);

    if (platformError) {
      console.error('Error fetching platform churches:', platformError);
      throw platformError;
    }

    let linkedChurchIds = (platformChurches || []).map(pc => pc.church_id);
    platformChurchIds = new Set(linkedChurchIds);
    console.log(`🏙️ Platform ${cityPlatformId} has ${linkedChurchIds.length} linked churches`);

    // OPTIMIZATION: If we have region church IDs, intersect with platform churches
    // This dramatically reduces the number of churches we need to fetch
    if (regionChurchIds) {
      const beforeCount = linkedChurchIds.length;
      linkedChurchIds = linkedChurchIds.filter(id => regionChurchIds!.has(id));
      console.log(`🚀 Region optimization: ${beforeCount} -> ${linkedChurchIds.length} churches to fetch`);
    }

    if (linkedChurchIds.length > 0) {
      // Fetch the actual church data for these specific IDs
      // Use fn_get_churches_simple but filter by the platform's church IDs
      // We need to batch if there are many IDs (Supabase has a limit on IN clause)
      const BATCH_SIZE = 500;
      const allPlatformChurches: any[] = [];

      for (let i = 0; i < linkedChurchIds.length; i += BATCH_SIZE) {
        const batch = linkedChurchIds.slice(i, i + BATCH_SIZE);
        const { data: batchData, error: batchError } = await supabase
          .rpc('fn_get_churches_simple')
          .in('id', batch);

        if (batchError) {
          console.error('Error fetching batch of platform churches:', batchError);
        } else if (batchData) {
          allPlatformChurches.push(...batchData);
        }
      }

      churchesRaw = allPlatformChurches;
      console.log(`✅ Got ${churchesRaw.length} platform churches from database`);
    }
  } else {
    // NATIONAL VIEW: Use the existing approach with limit
    // For national view, we don't need all 320k churches - just a sample
    const [regionsResult, churchesResult] = await Promise.all([
      supabase.from('region_settings').select('region_id').eq('is_enabled', true),
      supabase.rpc('fn_get_churches_simple').limit(10000),
    ]);

    enabledCountyFips = new Set(
      (regionsResult.data || []).map((r: any) => r.region_id)
    );

    if (churchesResult.error) {
      console.error('Error fetching churches:', churchesResult.error);
      throw churchesResult.error;
    }

    churchesRaw = churchesResult.data || [];
    console.log(`✅ Got ${churchesRaw.length} churches from database (national view)`);
  }

  // Fetch images and callings - batch to avoid URL length limits
  const churchIds = churchesRaw.map((c: any) => c.id);
  let imagesMap = new Map<string, { profile_photo_url?: string; banner_image_url?: string }>();
  let callingsMap = new Map<string, any[]>();

  // Batch size for IN queries (Supabase has URL length limits)
  const QUERY_BATCH_SIZE = 200;

  // Fetch images in batches
  for (let i = 0; i < churchIds.length; i += QUERY_BATCH_SIZE) {
    const batch = churchIds.slice(i, i + QUERY_BATCH_SIZE);
    const { data: imagesData, error: imagesError } = await supabase
      .from('churches')
      .select('id, profile_photo_url, banner_image_url')
      .or('profile_photo_url.neq.null,banner_image_url.neq.null')
      .in('id', batch);

    if (!imagesError && imagesData) {
      imagesData.forEach((p: any) => {
        imagesMap.set(p.id, {
          profile_photo_url: p.profile_photo_url || undefined,
          banner_image_url: p.banner_image_url || undefined
        });
      });
    }
  }
  console.log(`📸 Found ${imagesMap.size} churches with images`);

  // Fetch callings in batches
  for (let i = 0; i < churchIds.length; i += QUERY_BATCH_SIZE) {
    const batch = churchIds.slice(i, i + QUERY_BATCH_SIZE);
    const { data: callingsData, error: callingsError } = await supabase
      .from('church_calling')
      .select(`
        church_id,
        calling_id,
        custom_boundary_enabled,
        callings:calling_id (
          id,
          name,
          type,
          description,
          color
        )
      `)
      .in('church_id', batch);

    if (callingsError) {
      console.error('Error fetching church callings batch:', callingsError);
    } else if (callingsData) {
      callingsData.forEach((cc: any) => {
        if (cc.callings) {
          const callingWithFlag = {
            ...cc.callings,
            custom_boundary_enabled: cc.custom_boundary_enabled ?? false
          };

          if (!callingsMap.has(cc.church_id)) {
            callingsMap.set(cc.church_id, []);
          }
          callingsMap.get(cc.church_id)!.push(callingWithFlag);
        }
      });
    }
  }
  console.log(`📞 Fetched callings for ${callingsMap.size} churches`);

  // OPTIMIZATION: For platform view, all churches in churchesRaw are already the right ones
  // For national view, filter by enabled regions
  let visibleChurches: any[];
  if (platformChurchIds !== null) {
    // Platform view: all fetched churches are already platform churches
    visibleChurches = churchesRaw;
    console.log(`🗺️ Platform view: showing all ${visibleChurches.length} platform churches`);

    // Filter out LDS/Mormon churches if platform setting is disabled
    if (!displayLdsChurches) {
      const beforeCount = visibleChurches.length;
      visibleChurches = visibleChurches.filter((c: any) => {
        const name = (c.name || '').toLowerCase();
        // Filter out churches with LDS-related names
        const isLds = name.includes('latter day saints') ||
                      name.includes('latter-day saints') ||
                      name.includes(' lds ') ||
                      name.startsWith('lds ') ||
                      name.endsWith(' lds') ||
                      name === 'lds' ||
                      name.includes('mormon');
        return !isLds;
      });
      console.log(`🏛️ LDS filter: ${beforeCount} -> ${visibleChurches.length} churches (removed ${beforeCount - visibleChurches.length} LDS)`);
    }

    // Filter out Jehovah's Witness churches if platform setting is disabled
    if (!displayJwChurches) {
      const beforeCount = visibleChurches.length;
      visibleChurches = visibleChurches.filter((c: any) => {
        const name = (c.name || '').toLowerCase();
        // Filter out churches with Jehovah's Witness-related names
        const isJw = name.includes('kingdom hall') ||
                     name.includes('jehovah\'s witness') ||
                     name.includes('jehovahs witness') ||
                     name.includes('jehovah witness') ||
                     name.includes('watchtower') ||
                     name.includes('jw.org');
        return !isJw;
      });
      console.log(`⛪ JW filter: ${beforeCount} -> ${visibleChurches.length} churches (removed ${beforeCount - visibleChurches.length} JW)`);
    }
  } else {
    // National view: filter by enabled regions
    visibleChurches = (churchesRaw || []).filter((c: any) => {
      if (!c.county_fips) return true; // No county = show (failsafe)
      return enabledCountyFips.has(c.county_fips);
    });
    console.log(`🗺️ National view: ${(churchesRaw || []).length} -> ${visibleChurches.length} churches (region-filtered)`);
  }

  // Collect all unique boundary_ids from visible churches
  const allBoundaryIds = new Set<string>();
  visibleChurches.forEach((c: any) => {
    (c.boundary_ids || []).forEach((id: string) => allBoundaryIds.add(id));
  });

  // Fetch boundary details (name, type) for all boundary_ids — batch to avoid URL length limits
  let boundariesMap = new Map<string, { id: string; name: string; type: string }>();
  if (allBoundaryIds.size > 0) {
    const boundaryIdArray = Array.from(allBoundaryIds);
    const BOUNDARY_BATCH_SIZE = 200;
    for (let i = 0; i < boundaryIdArray.length; i += BOUNDARY_BATCH_SIZE) {
      const batch = boundaryIdArray.slice(i, i + BOUNDARY_BATCH_SIZE);
      const { data: boundariesData, error: boundariesError } = await supabase
        .from('boundaries')
        .select('id, name, type')
        .in('id', batch);

      if (boundariesError) {
        console.error('Error fetching boundaries:', boundariesError);
      } else if (boundariesData) {
        boundariesData.forEach((b: any) => {
          boundariesMap.set(b.id, { id: b.id, name: b.name, type: b.type });
        });
      }
    }
  }

  // Parse location, primary_ministry_area for each church
  // Use visibleChurches since we've already filtered by region
  const churches = visibleChurches.map((c: any) => {
    let location = null;

    if (c.location && typeof c.location === 'string') {
      try {
        location = JSON.parse(c.location);
      } catch (e) {
        console.error('Failed to parse location JSON for church', c.id);
      }
    } else if (c.location && typeof c.location === 'object') {
      location = c.location;
    }

    // Don't include full primary_ministry_area geometry in bulk response —
    // polygons can be huge and cause OOM. Send a boolean flag instead.
    // Full geometry is fetched on-demand via GET /api/churches/:id
    const has_primary_ministry_area = !!c.primary_ministry_area;

    // Get callings from the pre-fetched map (includes custom_boundary_enabled)
    const callings = callingsMap.get(c.id) || [];

    const images = imagesMap.get(c.id) || {};

    // Map boundary_ids to boundary objects
    const boundaries = (c.boundary_ids || [])
      .map((id: string) => boundariesMap.get(id))
      .filter(Boolean);

    return {
      ...c,
      location,
      primary_ministry_area: null,
      has_primary_ministry_area,
      callings,
      boundaries,
      profile_photo_url: images.profile_photo_url || c.profile_photo_url || null,
      banner_image_url: images.banner_image_url || c.banner_image_url || null
    };
  });

  // Apply filters
  let filteredChurches = churches;

  // Filter by search term (name or address)
  if (searchTerm && searchTerm.trim()) {
    const searchLower = searchTerm.toLowerCase().trim();
    filteredChurches = filteredChurches.filter((c: any) => {
      const nameMatch = c.name?.toLowerCase().includes(searchLower);
      const addressMatch = c.address?.toLowerCase().includes(searchLower);
      const cityMatch = c.city?.toLowerCase().includes(searchLower);
      return nameMatch || addressMatch || cityMatch;
    });
    console.log(`🔍 Search filter "${searchTerm}" reduced to ${filteredChurches.length} churches`);
  }

  // Filter by collab_have
  if (collabHave && collabHave.trim()) {
    const haveTags = collabHave.split(',').map(t => t.trim());
    filteredChurches = filteredChurches.filter((c: any) => {
      const churchHave = c.collaboration_have || [];
      return haveTags.some(tag => churchHave.includes(tag));
    });
    console.log(`🏷️ CollabHave filter reduced to ${filteredChurches.length} churches`);
  }

  // Filter by collab_need
  if (collabNeed && collabNeed.trim()) {
    const needTags = collabNeed.split(',').map(t => t.trim());
    filteredChurches = filteredChurches.filter((c: any) => {
      const churchNeed = c.collaboration_need || [];
      return needTags.some(tag => churchNeed.includes(tag));
    });
    console.log(`🏷️ CollabNeed filter reduced to ${filteredChurches.length} churches`);
  }

  // Region spatial filtering - SKIPPED if early optimization was applied
  // The early optimization already filtered churches at fetch time
  if (regionId && cityPlatformId && !regionChurchIds) {
    // Fallback: only runs if early optimization failed
    console.log(`🗺️ Fallback: Applying region filter for region ${regionId}`);

    const { data: regionBoundaries, error: regionError } = await supabase
      .from('region_boundaries')
      .select('boundary_id')
      .eq('region_id', regionId);

    if (regionError) {
      console.error('Error fetching region boundaries:', regionError);
    } else if (regionBoundaries && regionBoundaries.length > 0) {
      const regionBoundaryIds = regionBoundaries.map(rb => rb.boundary_id);

      const { data: churchesInRegion, error: spatialError } = await supabase.rpc(
        'fn_churches_within_boundaries',
        { p_boundary_ids: regionBoundaryIds }
      );

      if (spatialError) {
        console.error('Error with spatial region query:', spatialError);
      } else if (churchesInRegion) {
        const churchIdsInRegion = new Set(churchesInRegion.map((c: any) => c.church_id));
        const beforeCount = filteredChurches.length;
        filteredChurches = filteredChurches.filter((c: any) => churchIdsInRegion.has(c.id));
        console.log(`🗺️ Region filter: ${beforeCount} -> ${filteredChurches.length} churches`);
      }
    }
  }

  console.log(`✅ Returning ${filteredChurches.length} churches with locations and boundaries`);
  return filteredChurches;
}

export async function POST(req: Request, res: Response) {
  try {
    // Extract optional city_platform_id from request body (not part of insertChurchSchema)
    const { city_platform_id, ...churchData } = req.body;
    const validatedData = insertChurchSchema.parse(churchData);
    const supabase = supabaseServer();

    // Convert GeoJSON location to EWKT format for PostGIS
    // PostGIS requires EWKT or WKT, not raw GeoJSON objects
    let insertData: any = {
      ...validatedData,
      approved: false,
      source: 'manual',
    };

    if (validatedData.location && validatedData.location.coordinates) {
      const [lng, lat] = validatedData.location.coordinates;
      // Use EWKT format: SRID=4326;POINT(longitude latitude)
      insertData.location = `SRID=4326;POINT(${lng} ${lat})`;
      console.log(`[Church Create] Converting location to EWKT: ${insertData.location}`);
    }

    const { data, error } = await supabase
      .from('churches')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    // Set county_fips and boundary_ids based on location
    if (data?.id && data?.location) {
      const { data: setupResult, error: setupError } = await supabase.rpc(
        'fn_setup_church_location',
        { church_id: data.id }
      );
      
      if (setupError) {
        console.warn('Warning: Could not setup church location data:', setupError.message);
      } else {
        console.log(`Church location setup: county_fips=${setupResult?.county_fips}, boundaries=${setupResult?.boundary_count}`);
      }

      // Auto-link to matching city platforms with 'pending' status
      // Find platforms whose boundaries contain this church
      try {
        // Get the church's boundary_ids after setup
        const { data: churchWithBoundaries } = await supabase
          .from('churches')
          .select('boundary_ids')
          .eq('id', data.id)
          .single();

        let matchingPlatformIds: string[] = [];

        if (churchWithBoundaries && churchWithBoundaries.boundary_ids && churchWithBoundaries.boundary_ids.length > 0) {
          // Find platforms that have any of these boundaries
          const { data: matchingPlatforms } = await supabase
            .from('city_platform_boundaries')
            .select('city_platform_id')
            .in('boundary_id', churchWithBoundaries.boundary_ids);

          if (matchingPlatforms && matchingPlatforms.length > 0) {
            matchingPlatformIds = Array.from(new Set(matchingPlatforms.map(p => p.city_platform_id)));
          }
        }

        // Fallback: If no boundaries matched, use spatial containment query
        if (matchingPlatformIds.length === 0 && validatedData.location?.coordinates) {
          console.log(`[Church Create] No boundary_ids match, using spatial fallback for auto-linking`);
          const [lng, lat] = validatedData.location.coordinates;
          
          // Query boundaries containing this point and find their platforms
          const { data: containingBoundaries } = await supabase.rpc(
            'fn_boundaries_containing_point',
            { p_lng: lng, p_lat: lat }
          );

          if (containingBoundaries && containingBoundaries.length > 0) {
            const boundaryIds = containingBoundaries.map((b: any) => b.id);
            const { data: matchingPlatforms } = await supabase
              .from('city_platform_boundaries')
              .select('city_platform_id')
              .in('boundary_id', boundaryIds);

            if (matchingPlatforms && matchingPlatforms.length > 0) {
              matchingPlatformIds = Array.from(new Set(matchingPlatforms.map(p => p.city_platform_id)));
            }
          }
        }

        // If an explicit city_platform_id was provided, ensure it's in the list
        if (city_platform_id && !matchingPlatformIds.includes(city_platform_id)) {
          matchingPlatformIds.push(city_platform_id);
          console.log(`[Church Create] Added explicit platform ${city_platform_id} to linking list`);
        }

        if (matchingPlatformIds.length > 0) {
          console.log(`[Church Create] Found ${matchingPlatformIds.length} matching platforms for auto-linking`);

          // Create pending links for each platform
          const platformLinks = matchingPlatformIds.map(platformId => ({
            city_platform_id: platformId,
            church_id: data.id,
            status: 'pending',
          }));

          const { error: linkError } = await supabase
            .from('city_platform_churches')
            .upsert(platformLinks, {
              onConflict: 'city_platform_id,church_id',
              ignoreDuplicates: true,
            });

          if (linkError) {
            console.warn('Warning: Could not auto-link church to platforms:', linkError.message);
          } else {
            console.log(`[Church Create] Auto-linked church to ${matchingPlatformIds.length} platforms with pending status`);
          }
        } else if (city_platform_id) {
          // Even if no boundary matches, link to the explicit platform
          console.log(`[Church Create] Linking to explicit platform ${city_platform_id} (no boundary matches)`);
          const { error: linkError } = await supabase
            .from('city_platform_churches')
            .upsert([{
              city_platform_id: city_platform_id,
              church_id: data.id,
              status: 'pending',
            }], {
              onConflict: 'city_platform_id,church_id',
              ignoreDuplicates: true,
            });

          if (linkError) {
            console.warn('Warning: Could not link church to explicit platform:', linkError.message);
          }
        } else {
          console.log(`[Church Create] No matching platforms found for auto-linking`);
        }
      } catch (linkErr: any) {
        console.warn('Warning: Error in platform auto-linking:', linkErr.message);
      }
    }

    res.status(201).json(data);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}
