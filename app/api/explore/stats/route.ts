import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

export interface ExploreStats {
  totalPlatforms: number;
  totalChurches: number;
  totalMembers: number;
}

export async function GET(req: Request, res: Response) {
  try {
    const adminClient = supabaseServer();

    const { count: platformCount, error: platformError } = await adminClient
      .from('city_platforms')
      .select('*', { count: 'exact', head: true })
      .eq('is_public', true)
      .eq('is_active', true);

    if (platformError) {
      console.error('Error fetching platform count:', platformError);
      return res.status(500).json({ error: 'Failed to fetch platform stats' });
    }

    const { data: platforms } = await adminClient
      .from('city_platforms')
      .select('id')
      .eq('is_public', true)
      .eq('is_active', true);

    const platformIds = platforms?.map(p => p.id) || [];

    let totalChurches = 0;
    let totalMembers = 0;

    if (platformIds.length > 0) {
      const { count: churchCount } = await adminClient
        .from('city_platform_churches')
        .select('*', { count: 'exact', head: true })
        .in('city_platform_id', platformIds)
        .eq('status', 'visible');

      totalChurches = churchCount || 0;

      const { count: memberCount } = await adminClient
        .from('city_platform_users')
        .select('*', { count: 'exact', head: true })
        .in('city_platform_id', platformIds)
        .eq('is_active', true);

      totalMembers = memberCount || 0;
    }

    const stats: ExploreStats = {
      totalPlatforms: platformCount || 0,
      totalChurches,
      totalMembers,
    };

    return res.status(200).json(stats);

  } catch (error) {
    console.error('Error in explore stats GET:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
