import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";

export interface CityPlatformMapData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  is_public: boolean;
  primary_boundary_id: string | null;
  default_center_lat: number | null;
  default_center_lng: number | null;
  default_zoom: number;
  church_count: number;
  member_count: number;
  centroid: {
    type: "Point";
    coordinates: [number, number];
  } | null;
  boundary_geojson: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  } | null;
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

    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const { data: platforms, error: platformsError } = await adminClient
      .from('city_platforms')
      .select(`
        id,
        name,
        slug,
        description,
        is_active,
        is_public,
        primary_boundary_id,
        default_center_lat,
        default_center_lng,
        default_zoom
      `)
      .order('created_at', { ascending: false });

    if (platformsError) {
      console.error('Error fetching platforms:', platformsError);
      return res.status(500).json({ error: 'Failed to fetch city platforms' });
    }

    const { data: churchCounts } = await adminClient
      .from('city_platform_churches')
      .select('city_platform_id');

    const churchCountMap = new Map<string, number>();
    if (churchCounts) {
      churchCounts.forEach((row) => {
        const current = churchCountMap.get(row.city_platform_id) || 0;
        churchCountMap.set(row.city_platform_id, current + 1);
      });
    }

    const { data: memberCounts } = await adminClient
      .from('city_platform_users')
      .select('city_platform_id')
      .eq('is_active', true);

    const memberCountMap = new Map<string, number>();
    if (memberCounts) {
      memberCounts.forEach((row) => {
        if (row.city_platform_id) {
          const current = memberCountMap.get(row.city_platform_id) || 0;
          memberCountMap.set(row.city_platform_id, current + 1);
        }
      });
    }

    const boundaryIds = platforms
      ?.filter(p => p.primary_boundary_id)
      .map(p => p.primary_boundary_id) || [];

    let boundaryDataMap = new Map<string, { geometry: any; centroid: any }>();
    
    if (boundaryIds.length > 0) {
      const { data: boundaryData, error: boundaryError } = await adminClient
        .from('boundaries')
        .select('id, geometry')
        .in('id', boundaryIds);

      if (!boundaryError && boundaryData) {
        for (const b of boundaryData) {
          let geometry = null;
          let centroid = null;
          
          if (b.geometry) {
            try {
              if (typeof b.geometry === 'string') {
                geometry = JSON.parse(b.geometry);
              } else {
                geometry = b.geometry;
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
                    centroid = {
                      type: "Point",
                      coordinates: [sumLng / count, sumLat / count]
                    };
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
                    centroid = {
                      type: "Point",
                      coordinates: [sumLng / count, sumLat / count]
                    };
                  }
                }
              }
            } catch (e) {
              console.error('Error parsing geometry for boundary:', b.id, e);
            }
          }
          
          boundaryDataMap.set(b.id, { geometry, centroid });
        }
      }
    }

    const platformsWithData: CityPlatformMapData[] = (platforms || []).map((platform) => {
      const boundaryInfo = platform.primary_boundary_id 
        ? boundaryDataMap.get(platform.primary_boundary_id) 
        : null;

      let centroid = boundaryInfo?.centroid || null;
      
      if (!centroid && platform.default_center_lat && platform.default_center_lng) {
        centroid = {
          type: "Point",
          coordinates: [platform.default_center_lng, platform.default_center_lat]
        };
      }

      return {
        id: platform.id,
        name: platform.name,
        slug: platform.slug,
        description: platform.description,
        is_active: platform.is_active,
        is_public: platform.is_public,
        primary_boundary_id: platform.primary_boundary_id,
        default_center_lat: platform.default_center_lat,
        default_center_lng: platform.default_center_lng,
        default_zoom: platform.default_zoom,
        church_count: churchCountMap.get(platform.id) || 0,
        member_count: memberCountMap.get(platform.id) || 0,
        centroid,
        boundary_geojson: boundaryInfo?.geometry || null,
      };
    });

    return res.status(200).json(platformsWithData);

  } catch (error) {
    console.error('Error in admin city-platforms/map GET:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
