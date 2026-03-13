import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../lib/supabaseServer";
import { insertPostSchema, type ReactionType, type ReactionCounts } from "@shared/schema";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, res: Response) {
  try {
    const supabase = supabaseServer();
    
    const limit = parseInt(req.query.limit as string) || 10;
    const cursor = req.query.cursor as string | undefined;
    let cityPlatformId = req.query.city_platform_id as string | undefined;
    const scope = req.query.scope as 'global' | 'platform' | undefined;
    const postType = req.query.post_type as 'general' | 'prayer_post' | undefined;
    
    // Resolve platform slug to UUID if needed
    if (cityPlatformId && !UUID_REGEX.test(cityPlatformId)) {
      const { data: platform, error: slugError } = await supabase
        .from('city_platforms')
        .select('id')
        .eq('slug', cityPlatformId)
        .single();
      
      if (slugError || !platform) {
        console.warn(`Could not resolve platform slug "${cityPlatformId}" for posts:`, slugError?.message);
        return res.json({ posts: [], nextCursor: null, hasMore: false });
      }
      console.log(`🔄 Resolved platform slug "${cityPlatformId}" to UUID "${platform.id}" for posts`);
      cityPlatformId = platform.id;
    }
    
    const authHeader = req.headers.authorization;
    let currentUserId: string | null = null;
    
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      currentUserId = user?.id || null;
    }
    
    // Order by last_activity_at (for prayer posts with recent activity) then created_at
    // Using COALESCE pattern: last_activity_at if set, otherwise created_at
    let query = supabase
      .from('posts')
      .select(`
        *,
        author:profiles!posts_author_id_fkey(id, full_name, first_name, avatar_url),
        church:churches!posts_church_id_fkey(id, name, city, state, denomination),
        linked_church:churches!posts_linked_church_id_fkey(id, name, city, state),
        platform:city_platforms!posts_city_platform_id_fkey(id, name, logo_url)
      `)
      .eq('status', 'published')
      .is('group_id', null);
    
    // City platform scoping (Phase 5C enhanced)
    // - scope=global: Only posts with city_platform_id IS NULL (national community)
    // - scope=platform + city_platform_id: Only posts for that specific platform
    // - No scope: backward compatible, returns all posts
    // Note: prayer_post type is always platform-specific (never global)
    if (scope === 'global') {
      // Global scope: only posts without platform association
      query = query.is('city_platform_id', null);
      // Prayer posts are always platform-specific, so exclude them from global feed
      query = query.neq('post_type', 'prayer_post');
    } else if (scope === 'platform' && cityPlatformId) {
      // Platform scope: only posts for this platform
      query = query.eq('city_platform_id', cityPlatformId);
    } else if (cityPlatformId) {
      // Legacy: city_platform_id without scope (backward compatible)
      query = query.eq('city_platform_id', cityPlatformId);
    }
    
    // Optional post type filter
    if (postType) {
      query = query.eq('post_type', postType);
    }
    
    query = query
      .order('last_activity_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(limit + 1);
    
    // For cursor-based pagination, use a composite cursor: last_activity_at|created_at
    if (cursor) {
      const [activityCursor, createdCursor] = cursor.split('|');
      if (activityCursor && activityCursor !== 'null') {
        query = query.or(`last_activity_at.lt.${activityCursor},and(last_activity_at.is.null,created_at.lt.${createdCursor || activityCursor})`);
      } else if (createdCursor) {
        query = query.lt('created_at', createdCursor);
      }
    }
    
    const { data: posts, error } = await query;

    if (error) throw error;

    const postIds = (posts || []).map((p: any) => p.id);

    const { data: commentCounts, error: countError } = await supabase
      .from('post_comments')
      .select('post_id')
      .in('post_id', postIds);

    if (countError) throw countError;

    const commentCountMap = new Map<string, number>();
    (commentCounts || []).forEach((c: any) => {
      commentCountMap.set(c.post_id, (commentCountMap.get(c.post_id) || 0) + 1);
    });

    const reactionCountsMap = new Map<string, ReactionCounts>();
    const userReactionsMap = new Map<string, ReactionType[]>();

    // Try to fetch reactions - table may not exist if migration not run
    try {
      const { data: reactions, error: reactionsError } = await supabase
        .from('post_reactions')
        .select('post_id, reaction_type, user_id')
        .in('post_id', postIds);

      if (!reactionsError && reactions) {
        for (const reaction of reactions) {
          const postId = reaction.post_id;
          const type = reaction.reaction_type as ReactionType;

          if (!reactionCountsMap.has(postId)) {
            reactionCountsMap.set(postId, { like: 0, pray: 0, celebrate: 0, support: 0 });
          }
          const counts = reactionCountsMap.get(postId)!;
          counts[type] = (counts[type] || 0) + 1;

          if (currentUserId && reaction.user_id === currentUserId) {
            if (!userReactionsMap.has(postId)) {
              userReactionsMap.set(postId, []);
            }
            userReactionsMap.get(postId)!.push(type);
          }
        }
      }
    } catch (reactionErr) {
      // Silently ignore if post_reactions table doesn't exist (migration not run)
      console.log('Reactions table not available, skipping reaction data');
    }

    const hasMore = (posts || []).length > limit;
    const postsToReturn = hasMore ? (posts || []).slice(0, limit) : (posts || []);
    
    // Find prayer posts and fetch preview comments for them
    const prayerPostIds = postsToReturn
      .filter((p: any) => p.post_type === 'prayer_post')
      .map((p: any) => p.id);
    
    // Find the first prayer post in the list to give it more comments
    let firstPrayerPostId: string | null = null;
    for (const post of postsToReturn) {
      if ((post as any).post_type === 'prayer_post') {
        firstPrayerPostId = (post as any).id;
        break;
      }
    }
    
    // Fetch preview comments for prayer posts (most recent first)
    const previewCommentsMap = new Map<string, any[]>();
    if (prayerPostIds.length > 0) {
      try {
        const { data: previewComments, error: previewError } = await supabase
          .from('post_comments')
          .select(`
            id,
            post_id,
            body,
            body_format,
            created_at,
            display_name,
            guest_name,
            status,
            comment_type,
            author:profiles!post_comments_author_id_fkey(id, full_name, first_name, avatar_url)
          `)
          .in('post_id', prayerPostIds)
          .or('status.eq.published,status.is.null')
          .order('created_at', { ascending: false });
        
        if (!previewError && previewComments) {
          // Group comments by post_id
          for (const comment of previewComments) {
            if (!previewCommentsMap.has(comment.post_id)) {
              previewCommentsMap.set(comment.post_id, []);
            }
            previewCommentsMap.get(comment.post_id)!.push(comment);
          }
          
          // Limit comments: 3 for first prayer post, 1 for others
          Array.from(previewCommentsMap.entries()).forEach(([postId, comments]) => {
            const commentLimit = postId === firstPrayerPostId ? 3 : 1;
            // Reverse to show oldest first (chronological) after slicing
            previewCommentsMap.set(postId, comments.slice(0, commentLimit).reverse());
          });
        }
      } catch (previewErr) {
        console.log('Error fetching preview comments:', previewErr);
      }
    }
    
    const postsWithDetails = postsToReturn.map((post: any) => ({
      ...post,
      comment_count: commentCountMap.get(post.id) || 0,
      reaction_counts: reactionCountsMap.get(post.id) || { like: 0, pray: 0, celebrate: 0, support: 0 },
      user_reactions: userReactionsMap.get(post.id) || [],
      preview_comments: previewCommentsMap.get(post.id) || [],
      is_first_prayer_post: post.id === firstPrayerPostId,
    }));

    // Generate composite cursor for proper pagination with last_activity_at ordering
    const lastPost = postsToReturn.length > 0 ? postsToReturn[postsToReturn.length - 1] : null;
    const nextCursor = hasMore && lastPost
      ? `${lastPost.last_activity_at || 'null'}|${lastPost.created_at}` 
      : null;

    res.json({
      posts: postsWithDetails,
      nextCursor,
      hasMore,
    });
  } catch (error: any) {
    console.error('GET /api/posts error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function POST(req: Request, res: Response) {
  try {
    // Extract bearer token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const token = authHeader.substring(7);
    
    // Validate JWT using user client
    const userClient = supabaseUserClient(token);
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validatedData = insertPostSchema.parse(req.body);
    
    // Use service role client for mutation (bypasses RLS)
    const supabase = supabaseServer();
    const { data, error } = await supabase
      .from('posts')
      .insert({
        author_id: user.id,
        title: validatedData.title,
        body: validatedData.body,
        body_format: validatedData.bodyFormat || 'plain_text',
        rich_body: validatedData.richBody || null,
        media_url: validatedData.mediaUrl,
        media_urls: validatedData.mediaUrls || [],
        media_type: validatedData.mediaType || 'none',
        church_id: validatedData.churchId,
        group_id: null,
        status: 'published',
        city_platform_id: validatedData.cityPlatformId || null, // City platform scoping (Phase 5C)
      })
      .select(`
        *,
        author:profiles!posts_author_id_fkey(id, full_name, first_name),
        church:churches!posts_church_id_fkey(id, name, city, state, denomination),
        platform:city_platforms!posts_city_platform_id_fkey(id, name, logo_url)
      `)
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error: any) {
    console.error('POST /api/posts error:', error);
    res.status(400).json({ error: error.message });
  }
}
