import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";

export async function POST(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const supabase = supabaseServer();

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Only super admins can run backfills' });
    }

    const { data: prayerPosts, error: fetchError } = await supabase
      .from('posts')
      .select('id, linked_church_id, city_platform_id')
      .eq('post_type', 'prayer_post')
      .not('linked_church_id', 'is', null);

    if (fetchError) {
      console.error('Error fetching prayer posts:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch prayer posts' });
    }

    const postsNeedingUpdate = prayerPosts?.filter(p => !p.city_platform_id) || [];
    
    if (postsNeedingUpdate.length === 0) {
      return res.json({
        success: true,
        message: 'No prayer posts need backfilling',
        updated: 0,
        total: prayerPosts?.length || 0,
      });
    }

    let updatedCount = 0;
    const errors: string[] = [];

    for (const post of postsNeedingUpdate) {
      const { data: churchPlatform } = await supabase
        .from('city_platform_churches')
        .select('city_platform_id')
        .eq('church_id', post.linked_church_id)
        .eq('status', 'visible')
        .limit(1)
        .maybeSingle();

      if (churchPlatform?.city_platform_id) {
        const { error: updateError } = await supabase
          .from('posts')
          .update({ city_platform_id: churchPlatform.city_platform_id })
          .eq('id', post.id);

        if (updateError) {
          errors.push(`Failed to update post ${post.id}: ${updateError.message}`);
        } else {
          updatedCount++;
        }
      }
    }

    return res.json({
      success: true,
      message: `Backfilled ${updatedCount} prayer posts with platform IDs`,
      updated: updatedCount,
      total: prayerPosts?.length || 0,
      needingUpdate: postsNeedingUpdate.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('POST /api/admin/posts/backfill-platform error:', error);
    res.status(500).json({ error: error.message });
  }
}
