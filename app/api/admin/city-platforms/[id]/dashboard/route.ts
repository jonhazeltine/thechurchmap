import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";

export async function GET(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const platformId = req.params.id;
    
    if (!platformId) {
      return res.status(400).json({ error: 'Platform ID is required' });
    }

    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Resolve slug to UUID if needed
    let resolvedPlatformId = platformId;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(platformId);
    
    if (!isUUID) {
      // It's a slug, resolve to UUID
      const { data: platformLookup, error: lookupError } = await adminClient
        .from('city_platforms')
        .select('id')
        .eq('slug', platformId)
        .single();
      
      if (lookupError || !platformLookup) {
        return res.status(404).json({ error: 'Platform not found' });
      }
      resolvedPlatformId = platformLookup.id;
    }

    // Check if user has access to this platform
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    
    if (!isSuperAdmin) {
      // Check for super_admin role in city_platform_users
      const { data: superAdminCheck } = await adminClient
        .from('city_platform_users')
        .select('id')
        .eq('user_id', user.id)
        .eq('role', 'super_admin')
        .eq('is_active', true)
        .limit(1);
      
      if (!superAdminCheck?.length) {
        // Check for platform access
        const { data: platformAccess } = await adminClient
          .from('city_platform_users')
          .select('id, role')
          .eq('user_id', user.id)
          .eq('city_platform_id', resolvedPlatformId)
          .eq('is_active', true)
          .in('role', ['platform_owner', 'platform_admin'])
          .limit(1);
        
        if (!platformAccess?.length) {
          return res.status(403).json({ error: 'Access denied to this platform' });
        }
      }
    }

    // Fetch platform details with primary boundary
    const { data: platform, error: platformError } = await adminClient
      .from('city_platforms')
      .select(`
        *,
        primary_boundary:boundaries(id, name, type)
      `)
      .eq('id', resolvedPlatformId)
      .single();
    
    if (platformError || !platform) {
      return res.status(404).json({ error: 'Platform not found' });
    }

    // Fetch stats in parallel
    const [churchesResult, pendingChurchesResult, boundariesResult, usersResult, ownersResult, prayersResult, postsResult] = await Promise.all([
      adminClient
        .from('city_platform_churches')
        .select('id', { count: 'exact', head: true })
        .eq('city_platform_id', resolvedPlatformId),
      adminClient
        .from('city_platform_churches')
        .select('id', { count: 'exact', head: true })
        .eq('city_platform_id', resolvedPlatformId)
        .eq('status', 'pending'),
      adminClient
        .from('city_platform_boundaries')
        .select('id', { count: 'exact', head: true })
        .eq('city_platform_id', resolvedPlatformId),
      adminClient
        .from('city_platform_users')
        .select('id', { count: 'exact', head: true })
        .eq('city_platform_id', resolvedPlatformId)
        .eq('is_active', true),
      adminClient
        .from('city_platform_users')
        .select('id', { count: 'exact', head: true })
        .eq('city_platform_id', resolvedPlatformId)
        .eq('role', 'platform_owner')
        .eq('is_active', true),
      // TODO: Once prayers are scoped to platforms, query that table
      Promise.resolve({ count: 0 }),
      // TODO: Once posts are scoped to platforms, query that table
      Promise.resolve({ count: 0 }),
    ]);

    // Handle primary_boundary which may come as array from Supabase
    const primaryBoundary = Array.isArray(platform.primary_boundary) 
      ? platform.primary_boundary[0] 
      : platform.primary_boundary;

    const response = {
      platform: {
        ...platform,
        primary_boundary: primaryBoundary || null,
      },
      stats: {
        church_count: churchesResult.count || 0,
        pending_church_count: pendingChurchesResult.count || 0,
        boundary_count: boundariesResult.count || 0,
        member_count: usersResult.count || 0,
        owner_count: ownersResult.count || 0,
        prayer_count: prayersResult.count || 0,
        post_count: postsResult.count || 0,
      },
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching platform dashboard:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
