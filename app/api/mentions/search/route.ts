import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function GET(req: Request, res: Response) {
  try {
    const query = (req.query.q as string || '').trim();
    const platformId = req.query.platformId as string | undefined;
    
    if (query.length < 1) {
      return res.json([]);
    }

    const supabase = supabaseServer();
    
    const profilesPromise = supabase
      .from('profiles')
      .select('id, full_name, first_name, avatar_url')
      .or(`full_name.ilike.%${query}%,first_name.ilike.%${query}%`)
      .limit(5);

    let churchResults: Array<{ id: string; name: string; avatar: string | null; type: 'church' }> = [];

    if (platformId) {
      const { data: platformChurches, error: pcError } = await supabase
        .from('city_platform_churches')
        .select('church_id, churches!inner(id, name, profile_photo_url)')
        .eq('city_platform_id', platformId)
        .eq('status', 'visible')
        .ilike('churches.name', `%${query}%`)
        .limit(10);

      if (pcError) {
        console.error('Platform churches join query error:', JSON.stringify(pcError));
      } else {
        churchResults = (platformChurches || []).map((pc: any) => ({
          id: pc.churches.id,
          name: pc.churches.name,
          avatar: pc.churches.profile_photo_url,
          type: 'church' as const,
        }));
      }
    } else {
      const { data: churches, error: cError } = await supabase
        .from('churches')
        .select('id, name, profile_photo_url')
        .ilike('name', `%${query}%`)
        .limit(10);

      if (cError) {
        console.error('Churches query error:', JSON.stringify(cError));
      } else {
        churchResults = (churches || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          avatar: c.profile_photo_url,
          type: 'church' as const,
        }));
      }
    }

    const profilesResult = await profilesPromise;
    if (profilesResult.error) {
      console.error('Profiles query error:', JSON.stringify(profilesResult.error));
    }

    const profileResults = (profilesResult.data || []).map((p: any) => ({
      id: p.id,
      name: p.full_name || p.first_name || 'Unknown',
      avatar: p.avatar_url,
      type: 'user' as const,
    }));

    const combined = [...churchResults, ...profileResults].slice(0, 15);
    res.json(combined);
  } catch (error: any) {
    console.error('GET /api/mentions/search error:', error);
    res.status(500).json({ error: error.message });
  }
}
