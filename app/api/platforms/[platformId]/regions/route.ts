import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolvePlatformId(
  supabase: ReturnType<typeof supabaseServer>,
  platformIdOrSlug: string
): Promise<{ id: string; name: string; is_public: boolean } | null> {
  if (UUID_REGEX.test(platformIdOrSlug)) {
    const { data } = await supabase
      .from('city_platforms')
      .select('id, name, is_public')
      .eq('id', platformIdOrSlug)
      .single();
    return data;
  }
  
  const { data } = await supabase
    .from('city_platforms')
    .select('id, name, is_public')
    .eq('slug', platformIdOrSlug)
    .single();
  return data;
}

export async function GET(req: Request, res: Response) {
  try {
    const adminClient = supabaseServer();
    const { platformId: platformIdOrSlug } = req.params;

    if (!platformIdOrSlug) {
      return res.status(400).json({ error: 'Missing platform ID' });
    }

    const resolvedPlatform = await resolvePlatformId(adminClient, platformIdOrSlug);
    if (!resolvedPlatform) {
      return res.status(404).json({ error: 'Platform not found' });
    }
    const platformId = resolvedPlatform.id;

    const { data: regionsWithCounts, error: rpcError } = await adminClient.rpc(
      'fn_get_platform_regions_with_counts',
      { p_platform_id: platformId }
    );

    if (rpcError) {
      console.error('Error fetching regions with counts:', rpcError);
      return res.status(500).json({ error: 'Failed to fetch regions' });
    }

    const regions = (regionsWithCounts || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      church_count: r.church_count || 0,
      cover_image_url: r.cover_image_url,
      sort_order: r.sort_order,
    }));

    return res.json({ 
      platform: {
        id: resolvedPlatform.id,
        name: resolvedPlatform.name,
      },
      regions 
    });
  } catch (error) {
    console.error("Error fetching platform regions:", error);
    return res.status(500).json({ error: "Failed to fetch platform regions" });
  }
}
