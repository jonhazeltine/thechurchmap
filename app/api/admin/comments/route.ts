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

    // Check if user is super admin
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    
    // Get user's admin platform IDs from city_platform_users
    let adminPlatformIds: string[] = [];

    if (!isSuperAdmin) {
      const { data: platformRoles } = await adminClient
        .from('city_platform_users')
        .select('role, city_platform_id')
        .eq('user_id', user.id)
        .in('role', ['super_admin', 'platform_owner', 'platform_admin'])
        .eq('is_active', true);

      adminPlatformIds = (platformRoles || [])
        .map(r => r.city_platform_id)
        .filter(Boolean);

      console.log('🔐 Admin comments access check:', {
        userId: user.id,
        platformRoles: platformRoles?.length || 0,
        adminPlatformIds
      });

      // Must have at least one platform admin role
      if (adminPlatformIds.length === 0) {
        return res.status(403).json({ error: 'Admin access required' });
      }
    }

    // Fetch comments with post relationship for city platform filtering
    let commentsQuery = adminClient
      .from('post_comments')
      .select(`
        *,
        post:posts!post_id(id, city_platform_id)
      `)
      .order('created_at', { ascending: false });

    const { data: comments, error: commentsError } = await commentsQuery;

    if (commentsError) {
      console.error('Error fetching comments:', commentsError);
      return res.status(500).json({ error: 'Failed to fetch comments' });
    }

    // Filter comments by platform access
    let filteredComments = comments || [];
    
    // Apply city platform filter if specified
    if (cityPlatformId) {
      filteredComments = filteredComments.filter((c: any) => 
        c.post?.city_platform_id === cityPlatformId
      );
    }
    
    // For non-super admins, filter to their platforms only
    if (!isSuperAdmin && adminPlatformIds.length > 0) {
      filteredComments = filteredComments.filter((c: any) => 
        adminPlatformIds.includes(c.post?.city_platform_id)
      );
    }

    return res.status(200).json(filteredComments);

  } catch (error) {
    console.error('Error in admin comments:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
