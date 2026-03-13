import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../../lib/supabaseServer";
import { z } from "zod";

const addPrayerResponseSchema = z.object({
  commentType: z.enum(['prayer_tap', 'encouragement']),
  body: z.string().min(1).max(2000),
  displayName: z.string().max(100).optional(),
  prayerId: z.string().uuid().optional(),
});

export async function GET(req: Request, res: Response) {
  try {
    const supabase = supabaseServer();
    const { id: churchId } = req.params;

    if (!churchId) {
      return res.status(400).json({ error: 'Church ID is required' });
    }

    // Check if prayer post exists for this church
    const { data: existingPost, error: fetchError } = await supabase
      .from('posts')
      .select(`
        *,
        author:profiles!posts_author_id_fkey(id, full_name, first_name, avatar_url),
        linked_church:churches!posts_linked_church_id_fkey(id, name, city, state)
      `)
      .eq('linked_church_id', churchId)
      .eq('post_type', 'prayer_post')
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching prayer post:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch prayer post' });
    }

    if (existingPost) {
      // Fetch comments for this post
      const { data: comments, error: commentsError } = await supabase
        .from('post_comments')
        .select(`
          *,
          author:profiles(id, full_name, first_name, avatar_url)
        `)
        .eq('post_id', existingPost.id)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(50);

      if (commentsError) {
        console.error('Error fetching comments:', commentsError);
      }

      return res.json({
        post: existingPost,
        comments: comments || [],
        exists: true,
      });
    }

    // No prayer post exists yet
    return res.json({
      post: null,
      comments: [],
      exists: false,
    });
  } catch (error: any) {
    console.error('GET /api/churches/:id/prayer-post error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function POST(req: Request, res: Response) {
  try {
    const supabase = supabaseServer();
    const { id: churchId } = req.params;

    if (!churchId) {
      return res.status(400).json({ error: 'Church ID is required' });
    }

    // Get the auth header to identify the user (optional for prayer taps)
    const authHeader = req.headers.authorization;
    let userId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const userClient = supabaseUserClient(token);
      const { data: { user } } = await userClient.auth.getUser();
      userId = user?.id || null;
    }

    // Parse and validate the request body
    const parseResult = addPrayerResponseSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request body',
        details: parseResult.error.issues 
      });
    }

    const { commentType, body, displayName, prayerId } = parseResult.data;

    // For encouragements, require login
    if (commentType === 'encouragement' && !userId) {
      return res.status(401).json({ error: 'Login required to post encouragements' });
    }

    // For prayer taps without login, require display name
    if (!userId && !displayName) {
      return res.json({ 
        posted: false, 
        message: 'Name required for prayer to appear in community feed' 
      });
    }

    // Get the church info
    const { data: church, error: churchError } = await supabase
      .from('churches')
      .select('id, name')
      .eq('id', churchId)
      .single();

    if (churchError || !church) {
      return res.status(404).json({ error: 'Church not found' });
    }

    // Find or create the prayer post for this church
    let { data: prayerPost, error: postError } = await supabase
      .from('posts')
      .select('id, city_platform_id')
      .eq('linked_church_id', churchId)
      .eq('post_type', 'prayer_post')
      .single();

    console.log('🙏 Prayer post lookup for church:', { churchId, churchName: church.name, found: !!prayerPost, postId: prayerPost?.id, city_platform_id: prayerPost?.city_platform_id });

    // If post exists but has no platform ID, try to fix it
    if (prayerPost && !prayerPost.city_platform_id) {
      const { data: churchPlatformFix } = await supabase
        .from('city_platform_churches')
        .select('city_platform_id')
        .eq('church_id', churchId)
        .eq('status', 'visible')
        .limit(1)
        .maybeSingle();
      
      if (churchPlatformFix?.city_platform_id) {
        console.log('🔧 Fixing missing platform ID on existing prayer post:', { postId: prayerPost.id, newPlatformId: churchPlatformFix.city_platform_id });
        await supabase
          .from('posts')
          .update({ city_platform_id: churchPlatformFix.city_platform_id })
          .eq('id', prayerPost.id);
      } else {
        console.log('⚠️ Could not find platform for church - prayer post will not appear in platform feed:', { churchId });
      }
    }

    if (postError && postError.code === 'PGRST116') {
      // Prayer post doesn't exist, create it
      // Need an author - use the current user if logged in, otherwise we need a system approach
      if (!userId) {
        // Try to find a church admin
        const { data: churchAdmin } = await supabase
          .from('church_user_roles')
          .select('user_id')
          .eq('church_id', churchId)
          .eq('role', 'church_admin')
          .eq('is_approved', true)
          .limit(1)
          .single();

        if (churchAdmin) {
          userId = churchAdmin.user_id;
        } else {
          // Find any approved member
          const { data: anyMember } = await supabase
            .from('church_user_roles')
            .select('user_id')
            .eq('church_id', churchId)
            .eq('is_approved', true)
            .limit(1)
            .single();

          if (anyMember) {
            userId = anyMember.user_id;
          }
        }
      }

      if (!userId) {
        // Still no author - find any user to be the author (platform will own it)
        const { data: anyProfile } = await supabase
          .from('profiles')
          .select('id')
          .limit(1)
          .single();

        if (anyProfile) {
          userId = anyProfile.id;
        } else {
          return res.status(500).json({ error: 'Unable to create prayer post - no author available' });
        }
      }

      // Get the default prayer post image from platform settings
      const { data: defaultImageSetting } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', 'defaultPrayerPostImage')
        .single();

      // Look up the church's platform(s) to set city_platform_id
      // This ensures prayer posts show up in platform-scoped community feeds
      // First check ALL statuses to debug
      const { data: allPlatformLinks, error: debugError } = await supabase
        .from('city_platform_churches')
        .select('city_platform_id, status')
        .eq('church_id', churchId);
      
      console.log('🔍 All platform links for church:', { churchId, links: allPlatformLinks, debugError });
      
      // Now get the visible one
      const { data: churchPlatform, error: platformError } = await supabase
        .from('city_platform_churches')
        .select('city_platform_id')
        .eq('church_id', churchId)
        .eq('status', 'visible')
        .limit(1)
        .maybeSingle();

      if (platformError) {
        console.error('Error looking up church platform:', platformError);
      }
      console.log('🏙️ Church platform lookup (visible only):', { churchId, platform: churchPlatform, error: platformError });

      // Create the prayer post
      const { data: newPost, error: createError } = await supabase
        .from('posts')
        .insert({
          author_id: userId,
          post_type: 'prayer_post',
          linked_church_id: churchId,
          title: `Prayer Focus: ${church.name}`,
          body: `Join us in lifting up ${church.name} in prayer. Every prayer matters, and together we can make a difference in our community.`,
          status: 'published',
          media_type: 'none',
          cover_image_url: defaultImageSetting?.value || null,
          last_activity_at: new Date().toISOString(),
          city_platform_id: churchPlatform?.city_platform_id || null,
        })
        .select('id')
        .single();

      if (createError) {
        console.error('Error creating prayer post:', createError);
        return res.status(500).json({ error: 'Failed to create prayer post' });
      }

      prayerPost = newPost;
    } else if (postError) {
      console.error('Error finding prayer post:', postError);
      return res.status(500).json({ error: 'Failed to find prayer post' });
    }

    // Get the author ID for the comment (could be null for anonymous prayer taps)
    const commentAuthorId = authHeader?.startsWith('Bearer ') ? userId : null;

    // Add the prayer response comment
    const { data: comment, error: commentError } = await supabase
      .from('post_comments')
      .insert({
        post_id: prayerPost!.id,
        author_id: commentAuthorId,
        body,
        comment_type: commentType,
        display_name: displayName || null,
        prayer_id: prayerId || null,
        status: 'published',
      })
      .select('id')
      .single();

    if (commentError) {
      console.error('Error creating comment:', commentError);
      return res.status(500).json({ error: 'Failed to add prayer response' });
    }

    // Update last_activity_at on the prayer post
    await supabase
      .from('posts')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', prayerPost!.id);

    return res.json({
      posted: true,
      postId: prayerPost!.id,
      commentId: comment.id,
      message: 'Prayer recorded in community feed',
    });
  } catch (error: any) {
    console.error('POST /api/churches/:id/prayer-post error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function PATCH(req: Request, res: Response) {
  try {
    const { id: churchId } = req.params;

    if (!churchId) {
      return res.status(400).json({ error: 'Church ID is required' });
    }

    // Require authentication
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const userClient = supabaseUserClient(token);
    const { data: { user } } = await userClient.auth.getUser();

    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const supabase = supabaseServer();

    // Check if user is church admin or super admin
    const { data: isAdmin } = await supabase
      .from('church_user_roles')
      .select('role')
      .eq('church_id', churchId)
      .eq('user_id', user.id)
      .eq('role', 'church_admin')
      .eq('is_approved', true)
      .single();

    const isSuperAdmin = user.user_metadata?.super_admin === true;

    if (!isAdmin && !isSuperAdmin) {
      return res.status(403).json({ error: 'Only church admins can edit the prayer post' });
    }

    // Get the prayer post
    const { data: prayerPost, error: fetchError } = await supabase
      .from('posts')
      .select('id')
      .eq('linked_church_id', churchId)
      .eq('post_type', 'prayer_post')
      .single();

    if (fetchError || !prayerPost) {
      return res.status(404).json({ error: 'Prayer post not found' });
    }

    // Update allowed fields
    const { title, body, coverImageUrl } = req.body;
    const updates: any = {};

    if (title !== undefined) updates.title = title;
    if (body !== undefined) updates.body = body;
    if (coverImageUrl !== undefined) updates.cover_image_url = coverImageUrl;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const { error: updateError } = await supabase
      .from('posts')
      .update(updates)
      .eq('id', prayerPost.id);

    if (updateError) {
      console.error('Error updating prayer post:', updateError);
      return res.status(500).json({ error: 'Failed to update prayer post' });
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('PATCH /api/churches/:id/prayer-post error:', error);
    res.status(500).json({ error: error.message });
  }
}
