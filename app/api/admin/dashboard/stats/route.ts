import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../../lib/supabaseServer";

export async function GET(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    
    // Verify JWT
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // For now, just check super_admin from metadata (bypass RLS recursion issue)
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    const isPlatformAdmin = isSuperAdmin; // Super admins are also platform admins

    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get stats (simplified for super admin)
    const [
      prayersResult,
      postsResult,
      churchesResult,
      platformLinkedChurchesResult,
      pendingApplicationsResult,
      platformMembersResult,
      activePlatformsResult,
      pendingChurchClaimsResult,
      pendingMemberRequestsResult
    ] = await Promise.all([
      // Pending prayers
      adminClient
        .from('prayers')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      
      // Recent posts (last 7 days)
      (() => {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return adminClient
          .from('posts')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'published')
          .gte('created_at', sevenDaysAgo.toISOString());
      })(),
      
      // Total global churches
      adminClient
        .from('churches')
        .select('*', { count: 'exact', head: true }),
      
      // Total platform-linked churches (sum of all city_platform_churches)
      adminClient
        .from('city_platform_churches')
        .select('*', { count: 'exact', head: true }),
      
      // Pending platform applications
      adminClient
        .from('city_platform_applications')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      
      // Total platform members across all platforms
      adminClient
        .from('city_platform_users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'member')
        .eq('is_active', true),
      
      // Active platforms count
      adminClient
        .from('city_platforms')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true),
      
      // Pending church claims
      adminClient
        .from('church_claims')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      
      // Pending platform membership requests
      adminClient
        .from('platform_membership_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
    ]);

    return res.status(200).json({
      // Existing stats
      pendingChurchClaims: pendingChurchClaimsResult.count || 0,
      pendingMemberApprovals: pendingMemberRequestsResult.count || 0,
      pendingPrayers: prayersResult.count || 0,
      recentPostsCount: postsResult.count || 0,
      
      // New platform stats
      totalChurches: churchesResult.count || 0,
      platformLinkedChurches: platformLinkedChurchesResult.count || 0,
      pendingPlatformApplications: pendingApplicationsResult.count || 0,
      totalPlatformMembers: platformMembersResult.count || 0,
      activePlatforms: activePlatformsResult.count || 0,
    });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
