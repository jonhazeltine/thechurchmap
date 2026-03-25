import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";
import wkx from "wkx";

export interface BoundaryFeature {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
}

export interface PlatformMapData {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  is_public: boolean;
  church_count: number;
  member_count: number;
  centroid: {
    type: "Point";
    coordinates: [number, number];
  } | null;
  boundary_geojson: BoundaryFeature | null; // Legacy single boundary (deprecated)
  boundaries: BoundaryFeature[]; // All platform boundaries
}

// Server-side cache for platforms map data (changes rarely)
let platformsMapCache: { data: any; timestamp: number } | null = null;
const PLATFORMS_MAP_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(req: Request, res: Response) {
  try {
    // Return cached data if fresh
    if (platformsMapCache && (Date.now() - platformsMapCache.timestamp) < PLATFORMS_MAP_CACHE_TTL) {
      return res.status(200).json(platformsMapCache.data);
    }

    const supabase = supabaseServer();

    const { data: platforms, error: platformsError } = await supabase
      .from('city_platforms')
      .select(`
        id,
        name,
        slug,
        is_active,
        is_public,
        primary_boundary_id,
        default_center_lat,
        default_center_lng,
        default_zoom
      `)
      .eq('is_active', true)
      .eq('is_public', true)
      .order('name', { ascending: true });

    if (platformsError) {
      console.error('Error fetching public platforms:', platformsError);
      return res.status(500).json({ error: 'Failed to fetch platforms' });
    }

    if (!platforms || platforms.length === 0) {
      return res.status(200).json([]);
    }

    const platformIds = platforms.map(p => p.id);

    // Fetch counts filtered to only the platforms we need (was loading ALL rows before)
    const { data: churchCounts } = await supabase
      .from('city_platform_churches')
      .select('city_platform_id')
      .in('city_platform_id', platformIds);

    const churchCountMap = new Map<string, number>();
    if (churchCounts) {
      churchCounts.forEach((row) => {
        const current = churchCountMap.get(row.city_platform_id) || 0;
        churchCountMap.set(row.city_platform_id, current + 1);
      });
    }

    const { data: memberCounts } = await supabase
      .from('city_platform_users')
      .select('city_platform_id')
      .eq('is_active', true)
      .in('city_platform_id', platformIds);

    const memberCountMap = new Map<string, number>();
    if (memberCounts) {
      memberCounts.forEach((row) => {
        if (row.city_platform_id) {
          const current = memberCountMap.get(row.city_platform_id) || 0;
          memberCountMap.set(row.city_platform_id, current + 1);
        }
      });
    }
    
    const { data: platformBoundaryLinks, error: linksError } = await supabase
      .from('city_platform_boundaries')
      .select('city_platform_id, boundary_id')
      .in('city_platform_id', platformIds);
    
    if (linksError) {
      console.error('Error fetching platform boundary links:', linksError);
    }
    
    // Collect all unique boundary IDs across all platforms
    const allBoundaryIds = new Set<string>();
    const platformBoundaryMap = new Map<string, string[]>(); // platform_id -> boundary_ids[]
    
    if (platformBoundaryLinks) {
      for (const link of platformBoundaryLinks) {
        allBoundaryIds.add(link.boundary_id);
        const existing = platformBoundaryMap.get(link.city_platform_id) || [];
        existing.push(link.boundary_id);
        platformBoundaryMap.set(link.city_platform_id, existing);
      }
    }
    
    // Also include primary_boundary_id as fallback
    for (const p of platforms) {
      if (p.primary_boundary_id) {
        allBoundaryIds.add(p.primary_boundary_id);
      }
    }

    // Helper to parse WKB geometry and compute centroid
    const parseGeometry = (geometryData: any): { geometry: any; centroid: any } | null => {
      let geometry = null;
      let centroid = null;
      
      if (!geometryData) return null;
      
      try {
        if (typeof geometryData === 'string') {
          if (/^[0-9a-fA-F]+$/.test(geometryData)) {
            const buffer = Buffer.from(geometryData, 'hex');
            const wkxGeometry = wkx.Geometry.parse(buffer);
            geometry = wkxGeometry.toGeoJSON();
          } else {
            geometry = JSON.parse(geometryData);
          }
        } else {
          geometry = geometryData;
        }
        
        if (geometry && geometry.coordinates) {
          const coords = geometry.coordinates;
          if (geometry.type === 'Polygon' && coords[0] && coords[0].length > 0) {
            let sumLng = 0, sumLat = 0, count = 0;
            for (const point of coords[0]) {
              sumLng += point[0];
              sumLat += point[1];
              count++;
            }
            if (count > 0) {
              centroid = { type: "Point", coordinates: [sumLng / count, sumLat / count] };
            }
          } else if (geometry.type === 'MultiPolygon' && coords.length > 0) {
            let sumLng = 0, sumLat = 0, count = 0;
            for (const polygon of coords) {
              if (polygon[0]) {
                for (const point of polygon[0]) {
                  sumLng += point[0];
                  sumLat += point[1];
                  count++;
                }
              }
            }
            if (count > 0) {
              centroid = { type: "Point", coordinates: [sumLng / count, sumLat / count] };
            }
          }
        }
      } catch (e) {
        console.error('Error parsing geometry:', e);
        return null;
      }
      
      return { geometry, centroid };
    };

    // Fetch all boundary geometries
    let boundaryDataMap = new Map<string, { geometry: any; centroid: any }>();
    
    if (allBoundaryIds.size > 0) {
      const { data: boundaryData, error: boundaryError } = await supabase
        .from('boundaries')
        .select('id, geometry')
        .in('id', Array.from(allBoundaryIds));

      if (!boundaryError && boundaryData) {
        for (const b of boundaryData) {
          const parsed = parseGeometry(b.geometry);
          if (parsed) {
            boundaryDataMap.set(b.id, parsed);
          }
        }
      }
    }

    const platformsWithData: PlatformMapData[] = platforms.map((platform) => {
      // Get all boundary IDs for this platform
      const platformBoundaryIds = platformBoundaryMap.get(platform.id) || [];
      
      // If no boundaries from city_platform_boundaries, fall back to primary_boundary_id
      if (platformBoundaryIds.length === 0 && platform.primary_boundary_id) {
        platformBoundaryIds.push(platform.primary_boundary_id);
      }
      
      // Log boundary count for debugging
      console.log(`🗺️ Platform "${platform.name}": ${platformBoundaryIds.length} boundaries linked`);
      
      // Collect all boundary geometries for this platform
      const boundaries: BoundaryFeature[] = [];
      let primaryCentroid: { type: "Point"; coordinates: [number, number] } | null = null;
      
      for (const boundaryId of platformBoundaryIds) {
        const boundaryInfo = boundaryDataMap.get(boundaryId);
        if (boundaryInfo?.geometry) {
          boundaries.push(boundaryInfo.geometry);
          // Use primary boundary's centroid for the marker position
          if (boundaryId === platform.primary_boundary_id && boundaryInfo.centroid?.coordinates) {
            primaryCentroid = {
              type: "Point" as const,
              coordinates: boundaryInfo.centroid.coordinates as [number, number]
            };
          }
        } else {
          console.warn(`⚠️ Platform "${platform.name}": boundary ${boundaryId} has no geometry`);
        }
      }
      
      // Use primary boundary centroid, or first boundary centroid, or default center
      let centroid = primaryCentroid;
      if (!centroid && boundaries.length > 0) {
        // Fallback to first boundary's centroid if no primary
        const firstBoundaryId = platformBoundaryIds[0];
        const firstBoundaryInfo = boundaryDataMap.get(firstBoundaryId);
        if (firstBoundaryInfo?.centroid?.coordinates) {
          centroid = {
            type: "Point" as const,
            coordinates: firstBoundaryInfo.centroid.coordinates as [number, number]
          };
        }
      }
      if (!centroid && platform.default_center_lat && platform.default_center_lng) {
        centroid = {
          type: "Point" as const,
          coordinates: [platform.default_center_lng, platform.default_center_lat] as [number, number]
        };
      }

      return {
        id: platform.id,
        name: platform.name,
        slug: platform.slug,
        is_active: platform.is_active,
        is_public: platform.is_public,
        church_count: churchCountMap.get(platform.id) || 0,
        member_count: memberCountMap.get(platform.id) || 0,
        centroid,
        boundary_geojson: boundaries[0] || null, // Legacy: first boundary for backwards compat
        boundaries, // All boundaries
      };
    });

    // Cache the result
    platformsMapCache = { data: platformsWithData, timestamp: Date.now() };

    return res.status(200).json(platformsWithData);

  } catch (error) {
    console.error('Error in public platforms/map GET:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
