import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function GET(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const cityPlatformId = req.query.city_platform_id as string | undefined;
    
    // Verify JWT
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is super admin (bypass RLS recursion)
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Fetch posts with author info
    let postsQuery = adminClient
      .from('posts')
      .select(`
        *,
        author:profiles!author_id(id, full_name, email),
        church:churches(id, name)
      `)
      .order('created_at', { ascending: false });

    // City platform filtering (Phase 5C)
    if (cityPlatformId) {
      postsQuery = postsQuery.eq('city_platform_id', cityPlatformId);
    }

    const { data: posts, error: postsError } = await postsQuery;

    if (postsError) {
      console.error('Error fetching posts:', postsError);
      return res.status(500).json({ error: 'Failed to fetch posts' });
    }

    return res.status(200).json(posts);

  } catch (error) {
    console.error('Error in admin posts:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
