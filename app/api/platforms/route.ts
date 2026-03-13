import type { Request, Response } from "express";
import { supabaseServer } from "../../../lib/supabaseServer";

export interface PublicPlatformWithStats {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  website: string | null;
  contact_email: string | null;
  default_center_lat: number | null;
  default_center_lng: number | null;
  default_zoom: number;
  created_at: string;
  church_count: number;
  member_count: number;
  primary_boundary?: {
    id: string;
    name: string;
    type: string;
  } | null;
  boundary_names: string[];
}

export async function GET(req: Request, res: Response) {
  try {
    const adminClient = supabaseServer();
    const { search, state } = req.query;

    const { data: platforms, error: platformsError } = await adminClient
      .from('city_platforms')
      .select(`
        id,
        name,
        slug,
        description,
        logo_url,
        banner_url,
        website,
        contact_email,
        default_center_lat,
        default_center_lng,
        default_zoom,
        created_at,
        primary_boundary:boundaries!city_platforms_primary_boundary_id_fkey(id, name, type)
      `)
      .eq('is_public', true)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (platformsError) {
      console.error('Error fetching public platforms:', platformsError);
      return res.status(500).json({ error: 'Failed to fetch platforms' });
    }

    if (!platforms || platforms.length === 0) {
      return res.status(200).json([]);
    }

    const platformIds = platforms.map(p => p.id);

    const { data: churchCounts } = await adminClient
      .from('city_platform_churches')
      .select('city_platform_id')
      .in('city_platform_id', platformIds)
      .eq('status', 'visible');

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
      .in('city_platform_id', platformIds)
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

    const { data: platformBoundaries } = await adminClient
      .from('city_platform_boundaries')
      .select(`
        city_platform_id,
        boundary:boundaries(id, name, type)
      `)
      .in('city_platform_id', platformIds)
      .in('role', ['primary', 'included']);

    const boundaryNamesMap = new Map<string, string[]>();
    if (platformBoundaries) {
      platformBoundaries.forEach((pb: any) => {
        if (pb.boundary && pb.city_platform_id) {
          const existing = boundaryNamesMap.get(pb.city_platform_id) || [];
          if (!existing.includes(pb.boundary.name)) {
            existing.push(pb.boundary.name);
          }
          boundaryNamesMap.set(pb.city_platform_id, existing);
        }
      });
    }

    let platformsWithStats: PublicPlatformWithStats[] = platforms.map((platform) => ({
      id: platform.id,
      name: platform.name,
      slug: platform.slug,
      description: platform.description,
      logo_url: platform.logo_url,
      banner_url: platform.banner_url,
      website: platform.website,
      contact_email: platform.contact_email,
      default_center_lat: platform.default_center_lat,
      default_center_lng: platform.default_center_lng,
      default_zoom: platform.default_zoom,
      created_at: platform.created_at,
      church_count: churchCountMap.get(platform.id) || 0,
      member_count: memberCountMap.get(platform.id) || 0,
      primary_boundary: platform.primary_boundary as PublicPlatformWithStats['primary_boundary'],
      boundary_names: boundaryNamesMap.get(platform.id) || [],
    }));

    if (search && typeof search === 'string') {
      const searchLower = search.toLowerCase();
      platformsWithStats = platformsWithStats.filter(p => 
        p.name.toLowerCase().includes(searchLower) ||
        p.description?.toLowerCase().includes(searchLower) ||
        p.boundary_names.some(bn => bn.toLowerCase().includes(searchLower))
      );
    }

    if (state && typeof state === 'string') {
      const stateLower = state.toLowerCase();
      platformsWithStats = platformsWithStats.filter(p =>
        p.boundary_names.some(bn => bn.toLowerCase().includes(stateLower))
      );
    }

    return res.status(200).json(platformsWithStats);

  } catch (error) {
    console.error('Error in platforms GET:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
