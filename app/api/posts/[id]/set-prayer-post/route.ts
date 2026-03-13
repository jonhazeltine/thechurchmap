import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../../lib/supabaseServer";
import { z } from "zod";

const setPrayerPostSchema = z.object({
  churchId: z.string().uuid(),
  confirmReplace: z.boolean().optional(),
});

export async function GET(req: Request, res: Response) {
  try {
    const supabase = supabaseServer();
    const { churchId } = req.query;

    if (!churchId || typeof churchId !== 'string') {
      return res.status(400).json({ error: 'Church ID is required' });
    }

    const { data: existingPrayerPost, error } = await supabase
      .from('posts')
      .select(`
        id,
        title,
        author:profiles!posts_author_id_fkey(id, full_name),
        created_at
      `)
      .eq('linked_church_id', churchId)
      .eq('post_type', 'prayer_post')
      .maybeSingle();

    if (error) {
      console.error('Error checking for existing prayer post:', error);
      return res.status(500).json({ error: 'Failed to check for existing prayer post' });
    }

    return res.json({
      exists: !!existingPrayerPost,
      existingPost: existingPrayerPost,
    });
  } catch (error: any) {
    console.error('GET /api/posts/:id/set-prayer-post error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function POST(req: Request, res: Response) {
  try {
    const { id: postId } = req.params;

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

    let isPlatformAdmin = false;
    if (!isSuperAdmin) {
      const { data: platformRole } = await supabase
        .from('platform_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'platform_admin')
        .eq('is_active', true)
        .maybeSingle();
      isPlatformAdmin = !!platformRole;
    }

    if (!isSuperAdmin && !isPlatformAdmin) {
      return res.status(403).json({ error: 'Only platform admins can designate prayer posts' });
    }

    const parseResult = setPrayerPostSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parseResult.error.issues
      });
    }

    const { churchId, confirmReplace } = parseResult.data;

    const { data: church, error: churchError } = await supabase
      .from('churches')
      .select('id, name')
      .eq('id', churchId)
      .single();

    if (churchError || !church) {
      return res.status(404).json({ error: 'Church not found' });
    }

    const { data: targetPost, error: postError } = await supabase
      .from('posts')
      .select('id, title, post_type, linked_church_id')
      .eq('id', postId)
      .single();

    if (postError || !targetPost) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (targetPost.post_type === 'prayer_post' && targetPost.linked_church_id === churchId) {
      return res.json({
        success: true,
        message: 'This post is already the prayer post for this church',
        alreadySet: true,
      });
    }

    const { data: existingPrayerPost, error: existingError } = await supabase
      .from('posts')
      .select('id, title')
      .eq('linked_church_id', churchId)
      .eq('post_type', 'prayer_post')
      .neq('id', postId)
      .maybeSingle();

    if (existingError) {
      console.error('Error checking existing prayer post:', existingError);
      return res.status(500).json({ error: 'Failed to check existing prayer post' });
    }

    if (existingPrayerPost && !confirmReplace) {
      return res.status(409).json({
        error: 'Prayer post already exists',
        existingPost: existingPrayerPost,
        requiresConfirmation: true,
        message: `This church already has a prayer post: "${existingPrayerPost.title}". Setting this post as the prayer post will replace the existing one.`,
      });
    }

    if (existingPrayerPost) {
      const { error: clearError } = await supabase
        .from('posts')
        .update({
          post_type: 'community',
          linked_church_id: null,
        })
        .eq('id', existingPrayerPost.id);

      if (clearError) {
        console.error('Error clearing existing prayer post:', clearError);
        return res.status(500).json({ error: 'Failed to clear existing prayer post' });
      }
    }

    const { data: defaultImageSetting } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'defaultPrayerPostImage')
      .maybeSingle();

    // Look up the church's platform to set city_platform_id
    // This ensures prayer posts show up in platform-scoped community feeds
    const { data: churchPlatform } = await supabase
      .from('city_platform_churches')
      .select('city_platform_id')
      .eq('church_id', churchId)
      .eq('status', 'visible')
      .limit(1)
      .maybeSingle();

    const { error: updateError } = await supabase
      .from('posts')
      .update({
        post_type: 'prayer_post',
        linked_church_id: churchId,
        cover_image_url: defaultImageSetting?.value || null,
        last_activity_at: new Date().toISOString(),
        city_platform_id: churchPlatform?.city_platform_id || null,
      })
      .eq('id', postId);

    if (updateError) {
      console.error('Error updating post:', updateError);
      return res.status(500).json({ error: 'Failed to set post as prayer post' });
    }

    return res.json({
      success: true,
      message: `This post is now the prayer post for ${church.name}. All new prayers and encouragements for this church will be gathered here.`,
      replacedPost: existingPrayerPost || null,
    });
  } catch (error: any) {
    console.error('POST /api/posts/:id/set-prayer-post error:', error);
    res.status(500).json({ error: error.message });
  }
}
