import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function GET(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const isSuperAdmin = user.user_metadata?.super_admin === true;

    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const [
      pendingChurchClaimsResult,
      pendingMemberRequestsResult,
      pendingPrayersResult,
      pendingApplicationsResult,
      pendingCommentsResult
    ] = await Promise.all([
      adminClient
        .from('church_claims')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      
      adminClient
        .from('platform_membership_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      
      adminClient
        .from('prayers')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      
      adminClient
        .from('city_platform_applications')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      
      adminClient
        .from('post_comments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
    ]);

    return res.status(200).json({
      pendingChurchClaims: pendingChurchClaimsResult.count || 0,
      pendingMemberApprovals: pendingMemberRequestsResult.count || 0,
      pendingPrayers: pendingPrayersResult.count || 0,
      pendingPlatformApplications: pendingApplicationsResult.count || 0,
      pendingComments: pendingCommentsResult.count || 0,
    });

  } catch (error) {
    console.error('Error fetching pending counts:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
