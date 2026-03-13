import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";
import type { VisiblePrayer } from "../../../../shared/schema";
import { getTemplatePrayersForChurch } from "../../../../shared/prayerTemplates";

/**
 * GET /api/prayers/visible
 * Returns zoom-aware prayers based on viewport, zoom level, and center distance
 * 
 * OPTIMIZED VERSION - Pure read, no database writes
 * - Parallelized fetches for speed
 * - Template prayers rendered on-the-fly (not stored)
 * - Target response time: <500ms
 * 
 * Query params:
 * - bbox: west,south,east,north
 * - zoom: number
 * - center_lat: number (map center latitude for proximity sorting)
 * - center_lng: number (map center longitude for proximity sorting)
 * - city_platform_id: optional platform filter
 */
export async function GET(req: Request, res: Response) {
  const startTime = Date.now();
  
  try {
    const { bbox, zoom, center_lat, center_lng, city_platform_id } = req.query;

    if (!bbox || !zoom) {
      return res.status(200).json([]);
    }
    
    const cityPlatformId = city_platform_id as string | undefined;
    const zoomLevel = parseFloat(zoom as string);
    const [west, south, east, north] = (bbox as string).split(',').map(parseFloat);
    const centerLat = center_lat ? parseFloat(center_lat as string) : null;
    const centerLng = center_lng ? parseFloat(center_lng as string) : null;

    if ([west, south, east, north].some(isNaN) || isNaN(zoomLevel)) {
      return res.status(400).json({ error: "Invalid bbox or zoom format" });
    }

    const supabase = supabaseServer();
    const t1 = Date.now();

    // Fetch platform settings for LDS/JW filtering if platformId is provided
    // Default to false (hide) to match church list API behavior
    let displayLdsChurches = false;
    let displayJwChurches = false;
    
    if (cityPlatformId) {
      const { data: platformSettings } = await supabase
        .from('city_platforms')
        .select('display_lds_churches, display_jw_churches')
        .eq('id', cityPlatformId)
        .single();
      
      if (platformSettings) {
        displayLdsChurches = platformSettings.display_lds_churches ?? false;
        displayJwChurches = platformSettings.display_jw_churches ?? false;
      }
    }
    
    // Helper function to normalize church name for pattern matching
    // Handles Unicode apostrophes, hyphens, and punctuation variations
    const normalizeName = (name: string): string => {
      return name
        .toLowerCase()
        .replace(/[''`]/g, "'")           // Normalize apostrophes (smart quotes, backticks)
        .replace(/[–—]/g, '-')            // Normalize hyphens (en-dash, em-dash)
        .replace(/\./g, '')               // Remove dots (e.g., "L.D.S." -> "LDS")
        .replace(/\s+/g, ' ')             // Normalize whitespace
        .trim();
    };
    
    // Helper function to check if church should be filtered out
    const shouldFilterChurch = (churchName: string | null): boolean => {
      if (!churchName) return false;
      const name = normalizeName(churchName);
      
      // Filter LDS/Mormon churches if disabled
      if (!displayLdsChurches) {
        if (name.includes('latter-day saints') || 
            name.includes('latter day saints') || 
            name.includes(' lds ') || 
            name.startsWith('lds ') || 
            name.endsWith(' lds') ||
            name === 'lds' ||
            name.includes('mormon')) {
          return true;
        }
      }
      
      // Filter JW churches if disabled
      if (!displayJwChurches) {
        if (name.includes('kingdom hall') || 
            name.includes("jehovah's witness") || 
            name.includes('jehovahs witness') ||
            name.includes('jehovah witness') ||
            name.includes('watchtower') ||
            name.includes('jworg')) {  // Normalized version of jw.org (dots removed)
          return true;
        }
      }
      
      return false;
    };

    // PARALLEL FETCH: Run queries simultaneously
    // At high zoom (>=13), skip global/regional prayers - focus on church prayers
    // This reduces round trips and latency significantly
    
    let globalPrayers: any[] = [];
    let regionalPrayers: any[] = [];
    let viewportChurches: any[] = [];
    
    let tractScopedPrayers: any[] = [];
    
    if (zoomLevel >= 13) {
      // High zoom: Fetch churches and tract-scoped prayers
      const [churchesInViewportResult, tractPrayersResult] = await Promise.all([
        fetchChurchesInViewport(supabase, west, south, east, north),
        fetchTractScopedPrayers(supabase, west, south, east, north, cityPlatformId)
      ]);
      viewportChurches = churchesInViewportResult.churches || [];
      tractScopedPrayers = tractPrayersResult.data || [];
    } else {
      // Low/medium zoom: Fetch all types in parallel
      const [
        globalPrayersResult,
        regionalPrayersResult,
        churchesInViewportResult,
        tractPrayersResult
      ] = await Promise.all([
        fetchGlobalPrayers(supabase, cityPlatformId),
        fetchRegionalPrayers(supabase, west, south, east, north, cityPlatformId),
        fetchChurchesInViewport(supabase, west, south, east, north),
        fetchTractScopedPrayers(supabase, west, south, east, north, cityPlatformId)
      ]);
      
      globalPrayers = globalPrayersResult.data || [];
      regionalPrayers = regionalPrayersResult.data || [];
      viewportChurches = churchesInViewportResult.churches || [];
      tractScopedPrayers = tractPrayersResult.data || [];
    }
    
    // Filter out LDS/JW churches based on platform settings
    viewportChurches = viewportChurches.filter((c: any) => !shouldFilterChurch(c.name));
    
    const t2 = Date.now();

    // Fetch real church prayers (user-submitted)
    const churchIds = viewportChurches.map((c: any) => c.id);
    const { data: realChurchPrayers } = await fetchRealChurchPrayers(supabase, churchIds, cityPlatformId);
    const t3 = Date.now();
    
    // Get church prayer counts more efficiently - only for churches we'll actually use (nearest 30)
    // We'll fetch counts later, after we know which churches to display
    const churchPrayerCounts = new Map<string, number>();

    // Build church location map for distance calculations
    const churchLocationMap = new Map<string, { lat: number; lng: number; name: string; city: string }>();
    viewportChurches.forEach((c: any) => {
      if (c.id && c.latitude && c.longitude) {
        churchLocationMap.set(c.id, { 
          lat: c.latitude, 
          lng: c.longitude,
          name: c.name,
          city: c.city || ''
        });
      }
    });

    // Count real prayers per church
    const realPrayersByChurch = new Map<string, number>();
    (realChurchPrayers || []).forEach((p: any) => {
      if (p.church_id) {
        realPrayersByChurch.set(p.church_id, (realPrayersByChurch.get(p.church_id) || 0) + 1);
      }
    });

    // Combine all real prayers (including tract-scoped)
    let allPrayers: any[] = [...globalPrayers, ...regionalPrayers, ...(realChurchPrayers || []), ...tractScopedPrayers];

    // Deduplicate by ID
    const prayerMap = new Map();
    allPrayers.forEach(p => {
      if (!prayerMap.has(p.id)) {
        prayerMap.set(p.id, p);
      }
    });
    let uniquePrayers = Array.from(prayerMap.values());

    // Calculate distances helper
    const haversineDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    };

    // OPTIMIZED: Sort churches by distance and only generate templates for nearest 30
    const churchesWithDistance = viewportChurches.map((c: any) => {
      const distance = (centerLat && centerLng && c.latitude && c.longitude)
        ? haversineDistance(centerLat, centerLng, c.latitude, c.longitude)
        : 999999;
      return { ...c, distance };
    }).sort((a: any, b: any) => a.distance - b.distance);

    // Only process nearest 30 churches for template generation
    const nearestChurches = churchesWithDistance.slice(0, 30);
    const nearestChurchIds = nearestChurches.map((c: any) => c.id);
    const t4 = Date.now();

    // Fetch interaction counts for real prayers AND nearest churches in ONE query
    const realPrayerIds = uniquePrayers.map(p => p.id);
    let realPrayerCounts = new Map<string, number>();
    let nearestChurchCounts = new Map<string, number>();
    
    // Single query to get all interaction counts
    const { data: allInteractions } = await supabase
      .from('prayer_interactions')
      .select('prayer_id, church_id')
      .or(`prayer_id.in.(${realPrayerIds.join(',')}),church_id.in.(${nearestChurchIds.join(',')})`);
    const t5 = Date.now();
    
    if (allInteractions) {
      allInteractions.forEach((i: any) => {
        if (i.prayer_id && realPrayerIds.includes(i.prayer_id)) {
          realPrayerCounts.set(i.prayer_id, (realPrayerCounts.get(i.prayer_id) || 0) + 1);
        }
        if (i.church_id && nearestChurchIds.includes(i.church_id)) {
          nearestChurchCounts.set(i.church_id, (nearestChurchCounts.get(i.church_id) || 0) + 1);
        }
      });
    }

    // GENERATE TEMPLATE PRAYERS on-the-fly (only for nearest churches)
    const templatePrayers: any[] = [];
    const minPrayersPerChurch = 3;
    const templateDebugInfo: string[] = [];
    
    for (const church of nearestChurches) {
      const realCount = realPrayersByChurch.get(church.id) || 0;
      const needed = Math.max(0, minPrayersPerChurch - realCount);
      
      if (needed > 0) {
        const templates = getTemplatePrayersForChurch(
          church.id,
          church.name,
          church.city,
          needed
        );
        
        // Debug: Log template indices for first few churches
        if (templateDebugInfo.length < 5) {
          const indices = templates.map(t => t.templateIndex).join(',');
          templateDebugInfo.push(`${church.name.substring(0, 20)}: [${indices}]`);
        }
        
        // Get interaction count for this church (from database)
        const interactionCount = nearestChurchCounts.get(church.id) || 0;
        
        templates.forEach(t => {
          templatePrayers.push({
            id: t.id,
            title: t.title,
            body: t.body,
            church_id: church.id,
            church_name: church.name,
            display_first_name: null,
            display_last_initial: null,
            region_type: null,
            region_id: null,
            global: false,
            interaction_count: interactionCount,
            created_at: new Date().toISOString(),
            source: 'template',
            isTemplate: true,
            submitted_by_user_id: null,
            distance_from_center: church.distance
          });
        });
      }
    }

    // Use the haversineDistance helper defined above
    const calculateDistance = (prayer: any): number => {
      if (!centerLat || !centerLng) return 999999;
      
      if (prayer.church_id) {
        const loc = churchLocationMap.get(prayer.church_id);
        if (loc) {
          return haversineDistance(centerLat, centerLng, loc.lat, loc.lng);
        }
      }
      return 50; // Regional/global prayers
    };

    // Format real prayers
    const formattedRealPrayers = uniquePrayers.map((p: any) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      church_id: p.church_id,
      church_name: p.churches?.name || null,
      display_first_name: p.display_first_name,
      display_last_initial: p.display_last_initial,
      region_type: p.region_type,
      region_id: p.region_id,
      global: p.global,
      interaction_count: realPrayerCounts.get(p.id) || 0,
      created_at: p.created_at,
      source: 'real',
      isTemplate: false,
      submitted_by_user_id: p.submitted_by_user_id || null,
      distance_from_center: calculateDistance(p),
      scope_type: p.scope_type || null,
      tract_id: p.tract_id || null,
      click_lat: p.click_lat || null,
      click_lng: p.click_lng || null,
    }));

    // Template prayers already have distance_from_center from generation
    const formattedTemplatePrayers = templatePrayers;

    // Combine all prayers
    let allFormattedPrayers = [...formattedRealPrayers, ...formattedTemplatePrayers];

    // HIGH ZOOM FILTER: At zoom 15+, show only nearby churches
    if (zoomLevel >= 15 && centerLat && centerLng && allFormattedPrayers.length > 0) {
      const churchPrayers = allFormattedPrayers.filter(p => p.church_id && p.distance_from_center < 999999);
      
      if (churchPrayers.length > 0) {
        const minDistance = Math.min(...churchPrayers.map(p => p.distance_from_center));
        const coLocationThreshold = 0.05; // 50 meters
        
        const nearbyChurchIds = new Set<string>();
        churchPrayers.forEach(p => {
          if (p.church_id && p.distance_from_center <= minDistance + coLocationThreshold) {
            nearbyChurchIds.add(p.church_id);
          }
        });

        // Also include churches without coordinates that are in the bbox
        allFormattedPrayers
          .filter(p => p.church_id && p.distance_from_center >= 999999)
          .forEach(p => {
            if (p.church_id) nearbyChurchIds.add(p.church_id);
          });

        allFormattedPrayers = allFormattedPrayers.filter(p => 
          (p.church_id && nearbyChurchIds.has(p.church_id)) || 
          (p.global === true && p.submitted_by_user_id !== null)
        );

        // Round-robin interleave for co-located churches
        if (nearbyChurchIds.size > 1) {
          const userSubmitted = allFormattedPrayers.filter(p => p.submitted_by_user_id !== null);
          const autoGenerated = allFormattedPrayers.filter(p => p.submitted_by_user_id === null);
          
          const byChurch = new Map<string, any[]>();
          autoGenerated.forEach(p => {
            if (p.church_id) {
              if (!byChurch.has(p.church_id)) byChurch.set(p.church_id, []);
              byChurch.get(p.church_id)!.push(p);
            }
          });

          const interleaved: any[] = [];
          const churchArrays = Array.from(byChurch.values());
          const maxLength = Math.max(...churchArrays.map(arr => arr.length), 0);
          
          for (let i = 0; i < maxLength; i++) {
            for (const prayers of churchArrays) {
              if (i < prayers.length) {
                interleaved.push(prayers[i]);
              }
            }
          }
          
          allFormattedPrayers = [...userSubmitted, ...interleaved];
        }
      }
    }

    // Sort: user-submitted first, then by zoom-based priority
    const getPrayerWeight = (p: any): number => {
      const isGlobal = p.global === true;
      const isRegional = p.region_type !== null;
      
      if (zoomLevel < 10) {
        if (isGlobal) return 0;
        if (isRegional) return 1;
        return 2;
      } else if (zoomLevel < 13) {
        return 1;
      } else {
        if (p.church_id) return 0;
        if (isRegional) return 1;
        return 2;
      }
    };

    allFormattedPrayers.sort((a, b) => {
      const aIsUser = a.submitted_by_user_id !== null;
      const bIsUser = b.submitted_by_user_id !== null;
      
      if (aIsUser && !bIsUser) return -1;
      if (!aIsUser && bIsUser) return 1;
      if (aIsUser && bIsUser) {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      
      const aWeight = getPrayerWeight(a);
      const bWeight = getPrayerWeight(b);
      if (aWeight !== bWeight) return aWeight - bWeight;
      
      return a.distance_from_center - b.distance_from_center;
    });

    // Limit results
    const limitedPrayers = allFormattedPrayers.slice(0, 20);

    const elapsed = Date.now() - startTime;
    console.log(`✅ Prayer API: ${limitedPrayers.length} prayers in ${elapsed}ms | parallel=${t2-t1}ms realPrayers=${t3-t2}ms counts=${t5-t4}ms (${formattedRealPrayers.length} real, ${formattedTemplatePrayers.length} template)`);
    if (templateDebugInfo.length > 0) {
      console.log(`📿 Template diversity: ${templateDebugInfo.join(' | ')}`);
    }

    return res.status(200).json(limitedPrayers);

  } catch (error) {
    console.error('Error in GET /api/prayers/visible:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Helper functions

async function fetchGlobalPrayers(supabase: any, cityPlatformId?: string) {
  // Only fetch USER-SUBMITTED global prayers
  let query = supabase
    .from('prayers')
    .select(`
      id, title, body, church_id, city_platform_id,
      display_first_name, display_last_initial,
      region_type, region_id, global, created_at, submitted_by_user_id,
      churches (name)
    `)
    .eq('status', 'approved')
    .eq('global', true)
    .not('submitted_by_user_id', 'is', null); // Only user-submitted prayers
  
  if (cityPlatformId) {
    query = query.eq('city_platform_id', cityPlatformId);
  }
  
  return query.order('created_at', { ascending: false }).limit(20);
}

async function fetchRegionalPrayers(supabase: any, west: number, south: number, east: number, north: number, cityPlatformId?: string) {
  try {
    // Get boundaries in viewport
    const { data: boundaries } = await supabase.rpc('fn_get_boundaries_in_bbox', {
      west, south, east, north
    });
    
    const { data: areas } = await supabase.rpc('fn_get_areas_in_bbox', {
      west, south, east, north
    });
    
    const boundaryIds = (boundaries || []).map((b: any) => b.external_id).filter(Boolean);
    const areaIds = (areas || []).map((a: any) => a.id);
    
    if (boundaryIds.length === 0 && areaIds.length === 0) {
      return { data: [] };
    }
    
    // Only fetch USER-SUBMITTED regional prayers
    let query = supabase
      .from('prayers')
      .select(`
        id, title, body, church_id, city_platform_id,
        display_first_name, display_last_initial,
        region_type, region_id, area_id, global, created_at, submitted_by_user_id,
        churches (name)
      `)
      .eq('status', 'approved')
      .eq('global', false)
      .not('submitted_by_user_id', 'is', null); // Only user-submitted prayers
    
    if (cityPlatformId) {
      query = query.eq('city_platform_id', cityPlatformId);
    }
    
    const filters: string[] = [];
    if (boundaryIds.length > 0) {
      filters.push(`region_id.in.(${boundaryIds.map((id: string) => `"${id}"`).join(',')})`);
    }
    if (areaIds.length > 0) {
      filters.push(`area_id.in.(${areaIds.join(',')})`);
    }
    
    if (filters.length > 0) {
      query = query.or(filters.join(','));
    }
    
    return query.order('created_at', { ascending: false }).limit(30);
  } catch (err) {
    console.error('Error fetching regional prayers:', err);
    return { data: [] };
  }
}

async function fetchChurchesInViewport(supabase: any, west: number, south: number, east: number, north: number) {
  try {
    const { data: churches, error } = await supabase.rpc('fn_get_churches_with_coords_in_bbox', {
      west, south, east, north
    });
    
    if (error) {
      // Fallback to basic RPC
      const { data: basicChurches } = await supabase.rpc('fn_get_churches_in_bbox', {
        west, south, east, north
      });
      return { churches: basicChurches || [] };
    }
    
    return { churches: churches || [] };
  } catch (err) {
    console.error('Error fetching churches in viewport:', err);
    return { churches: [] };
  }
}

async function fetchRealChurchPrayers(supabase: any, churchIds: string[], cityPlatformId?: string) {
  if (churchIds.length === 0) {
    return { data: [] };
  }
  
  // Only fetch USER-SUBMITTED prayers (not old auto-generated ones)
  // Auto-generated prayers are now rendered as templates on-the-fly
  let query = supabase
    .from('prayers')
    .select(`
      id, title, body, church_id, city_platform_id,
      display_first_name, display_last_initial,
      region_type, region_id, global, created_at, submitted_by_user_id,
      churches (name)
    `)
    .eq('status', 'approved')
    .or('global.is.false,global.is.null')
    .is('region_type', null)
    .not('submitted_by_user_id', 'is', null) // Only user-submitted prayers
    .in('church_id', churchIds);
  
  if (cityPlatformId) {
    query = query.eq('city_platform_id', cityPlatformId);
  }
  
  return query.order('created_at', { ascending: false }).limit(50); // Limit for performance
}

async function fetchTractScopedPrayers(supabase: any, west: number, south: number, east: number, north: number, cityPlatformId?: string) {
  try {
    const { data: tractData, error: tractError } = await supabase.rpc('fn_boundaries_in_viewport', {
      min_lng: west,
      min_lat: south,
      max_lng: east,
      max_lat: north,
      boundary_type: 'census_tract',
      limit_count: 2000,
    });

    if (tractError) {
      console.error('Error fetching tracts from Supabase:', tractError);
      return { data: [] };
    }

    const geoids = (tractData || []).map((r: any) => r.external_id).filter(Boolean);

    if (geoids.length === 0) {
      return { data: [] };
    }

    let query = supabase
      .from('prayers')
      .select(`
        id, title, body, church_id, city_platform_id,
        display_first_name, display_last_initial,
        region_type, region_id, global, created_at, submitted_by_user_id,
        scope_type, tract_id, click_lat, click_lng,
        churches (name)
      `)
      .eq('status', 'approved')
      .eq('scope_type', 'tract')
      .in('tract_id', geoids);

    if (cityPlatformId) {
      query = query.eq('city_platform_id', cityPlatformId);
    }

    return query.order('created_at', { ascending: false }).limit(30);
  } catch (err) {
    console.error('Error fetching tract-scoped prayers:', err);
    return { data: [] };
  }
}

async function fetchChurchPrayerCounts(supabase: any, west: number, south: number, east: number, north: number) {
  try {
    // Get church IDs in viewport
    const { data: churches } = await supabase.rpc('fn_get_churches_in_bbox', {
      west, south, east, north
    });
    
    const churchIds = (churches || []).map((c: any) => c.id);
    
    if (churchIds.length === 0) {
      return { counts: new Map() };
    }
    
    // Get interaction counts for these churches (for template prayers)
    const { data: interactions } = await supabase
      .from('prayer_interactions')
      .select('church_id')
      .in('church_id', churchIds);
    
    const counts = new Map<string, number>();
    (interactions || []).forEach((i: any) => {
      if (i.church_id) {
        counts.set(i.church_id, (counts.get(i.church_id) || 0) + 1);
      }
    });
    
    return { counts };
  } catch (err) {
    console.error('Error fetching church prayer counts:', err);
    return { counts: new Map() };
  }
}
