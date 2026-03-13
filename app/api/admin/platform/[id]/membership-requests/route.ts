import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";
import type { PlatformMembershipRequestWithDetails } from "@shared/schema";

async function checkPlatformAccess(
  adminClient: ReturnType<typeof supabaseServer>,
  userId: string,
  platformId: string,
  userMetadata: any
): Promise<{ hasAccess: boolean; isSuperAdmin: boolean; userRole: string | null }> {
  const isSuperAdmin = userMetadata?.super_admin === true;
  
  if (isSuperAdmin) {
    return { hasAccess: true, isSuperAdmin: true, userRole: 'super_admin' };
  }

  const { data: userRole } = await adminClient
    .from('city_platform_users')
    .select('role')
    .eq('city_platform_id', platformId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('role', ['platform_owner', 'platform_admin'])
    .single();

  return { 
    hasAccess: !!userRole, 
    isSuperAdmin: false, 
    userRole: userRole?.role || null 
  };
}

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

    const { id: platformId } = req.params;
    const status = req.query.status as string || 'pending';

    const { hasAccess } = await checkPlatformAccess(
      adminClient,
      user.id,
      platformId,
      user.user_metadata
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this platform' });
    }

    const { data: platform, error: platformError } = await adminClient
      .from('city_platforms')
      .select('id, name, slug')
      .eq('id', platformId)
      .single();

    if (platformError) {
      if (platformError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Platform not found' });
      }
      console.error('Error fetching platform:', platformError);
      return res.status(500).json({ error: 'Failed to fetch platform' });
    }

    let query = adminClient
      .from('platform_membership_requests')
      .select('*')
      .eq('platform_id', platformId)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: requests, error: requestsError } = await query;

    if (requestsError) {
      console.error('Error fetching membership requests:', requestsError);
      return res.status(500).json({ error: 'Failed to fetch membership requests' });
    }

    const userIds = [...new Set(requests?.map(r => r.user_id) || [])];
    const reviewerIds = [...new Set(requests?.filter(r => r.reviewed_by_user_id).map(r => r.reviewed_by_user_id) || [])];
    const allUserIds = [...new Set([...userIds, ...reviewerIds])];

    let profiles: Record<string, any> = {};

    if (allUserIds.length > 0) {
      const { data: profilesData } = await adminClient
        .from('profiles')
        .select('id, full_name, first_name, last_name, avatar_url')
        .in('id', allUserIds);

      if (profilesData) {
        profiles = profilesData.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
      }

      const userEmailPromises = allUserIds.map(async (userId) => {
        try {
          const { data: authUser } = await adminClient.auth.admin.getUserById(userId);
          if (authUser?.user) {
            return { userId, email: authUser.user.email };
          }
          return { userId, email: null };
        } catch (err) {
          console.error(`Error fetching auth user ${userId}:`, err);
          return { userId, email: null };
        }
      });

      const userEmailResults = await Promise.allSettled(userEmailPromises);
      userEmailResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          const { userId, email } = result.value;
          if (profiles[userId]) {
            profiles[userId].email = email;
          } else {
            profiles[userId] = {
              id: userId,
              full_name: null,
              first_name: null,
              last_name: null,
              avatar_url: null,
              email: email,
            };
          }
        }
      });
    }

    const requestsWithDetails: PlatformMembershipRequestWithDetails[] = (requests || []).map(request => ({
      ...request,
      user: {
        id: request.user_id,
        ...profiles[request.user_id],
      },
      platform: {
        id: platform.id,
        name: platform.name,
        slug: platform.slug,
      },
      reviewer: request.reviewed_by_user_id && profiles[request.reviewed_by_user_id] 
        ? {
            id: request.reviewed_by_user_id,
            full_name: profiles[request.reviewed_by_user_id].full_name,
            first_name: profiles[request.reviewed_by_user_id].first_name,
            last_name: profiles[request.reviewed_by_user_id].last_name,
          }
        : undefined,
    }));

    const { count: pendingCount } = await adminClient
      .from('platform_membership_requests')
      .select('*', { count: 'exact', head: true })
      .eq('platform_id', platformId)
      .eq('status', 'pending');

    return res.status(200).json({
      platform,
      requests: requestsWithDetails,
      pendingCount: pendingCount || 0,
    });

  } catch (error) {
    console.error('Error in GET /api/admin/platform/:id/membership-requests:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
