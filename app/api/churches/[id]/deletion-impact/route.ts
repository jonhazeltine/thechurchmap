import { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { canEditChurch } from "../../../../../lib/authMiddleware";

export interface DeletionImpact {
  churchName: string;
  prayers: number;
  prayerInteractions: number;
  posts: number;
  postComments: number;
  teamMembers: number;
  ministryAreas: number;
  callings: number;
  internalTags: number;
}

export async function GET(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const access = await canEditChurch(req, id);
    if (!access.allowed) {
      return res.status(access.authenticationFailed ? 401 : 403).json({ 
        error: access.reason || 'Permission denied' 
      });
    }

    const supabase = supabaseServer();

    const { data: church, error: churchError } = await supabase
      .from('churches')
      .select('name')
      .eq('id', id)
      .single();

    if (churchError || !church) {
      return res.status(404).json({ error: 'Church not found' });
    }

    const [
      prayersResult,
      postsResult,
      teamResult,
      areasResult,
      callingsResult,
      internalTagsResult
    ] = await Promise.all([
      supabase.from('prayers').select('id', { count: 'exact', head: true }).eq('church_id', id),
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('church_id', id),
      supabase.from('church_user_roles').select('id', { count: 'exact', head: true }).eq('church_id', id),
      supabase.from('areas').select('id', { count: 'exact', head: true }).eq('church_id', id),
      supabase.from('church_calling').select('id', { count: 'exact', head: true }).eq('church_id', id),
      supabase.from('internal_church_tags').select('id', { count: 'exact', head: true }).eq('church_id', id)
    ]);

    let prayerInteractions = 0;
    let postComments = 0;

    if ((prayersResult.count || 0) > 0) {
      const { data: prayerIds } = await supabase
        .from('prayers')
        .select('id')
        .eq('church_id', id);

      if (prayerIds && prayerIds.length > 0) {
        const { count } = await supabase
          .from('prayer_interactions')
          .select('id', { count: 'exact', head: true })
          .in('prayer_id', prayerIds.map(p => p.id));
        prayerInteractions = count || 0;
      }
    }

    if ((postsResult.count || 0) > 0) {
      const { data: postIds } = await supabase
        .from('posts')
        .select('id')
        .eq('church_id', id);

      if (postIds && postIds.length > 0) {
        const { count } = await supabase
          .from('post_comments')
          .select('id', { count: 'exact', head: true })
          .in('post_id', postIds.map(p => p.id));
        postComments = count || 0;
      }
    }

    const impact: DeletionImpact = {
      churchName: church.name,
      prayers: prayersResult.count || 0,
      prayerInteractions,
      posts: postsResult.count || 0,
      postComments,
      teamMembers: teamResult.count || 0,
      ministryAreas: areasResult.count || 0,
      callings: callingsResult.count || 0,
      internalTags: internalTagsResult.count || 0,
    };

    res.json(impact);
  } catch (error: any) {
    console.error('Error fetching deletion impact:', error);
    res.status(500).json({ error: error.message });
  }
}
