import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";

async function checkPlatformAccess(
  adminClient: ReturnType<typeof supabaseServer>,
  userId: string,
  platformId: string,
  userMetadata: any
): Promise<{ hasAccess: boolean; isSuperAdmin: boolean }> {
  const isSuperAdmin = userMetadata?.super_admin === true;
  
  if (isSuperAdmin) {
    return { hasAccess: true, isSuperAdmin: true };
  }

  const { data: userRole } = await adminClient
    .from('city_platform_users')
    .select('role')
    .eq('city_platform_id', platformId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('role', ['platform_owner', 'platform_admin'])
    .single();

  return { hasAccess: !!userRole, isSuperAdmin: false };
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

    const { id: platformIdOrSlug } = req.params;
    const { status = 'pending' } = req.query;

    // Resolve slug to UUID if needed
    let platformId = platformIdOrSlug;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(platformIdOrSlug);
    
    if (!isUUID) {
      // It's a slug, look up the platform by slug first
      const { data: platformBySlug, error: slugError } = await adminClient
        .from('city_platforms')
        .select('id')
        .eq('slug', platformIdOrSlug)
        .single();
      
      if (slugError || !platformBySlug) {
        return res.status(404).json({ error: 'Platform not found' });
      }
      platformId = platformBySlug.id;
    }

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
      .from('church_claims')
      .select('*')
      .eq('city_platform_id', platformId)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: claims, error: claimsError } = await query;

    if (claimsError) {
      console.error('Error fetching claims:', claimsError);
      return res.status(500).json({ error: 'Failed to fetch claims' });
    }

    const churchIds = [...new Set(claims?.map(c => c.church_id) || [])];
    const userIds = [...new Set(claims?.map(c => c.user_id) || [])];
    const reviewerIds = [...new Set(claims?.filter(c => c.reviewed_by_user_id).map(c => c.reviewed_by_user_id!) || [])];
    const allUserIds = [...new Set([...userIds, ...reviewerIds])];

    let churches: Record<string, any> = {};
    let profiles: Record<string, any> = {};

    if (churchIds.length > 0) {
      const { data: churchesData } = await adminClient
        .from('churches')
        .select('id, name, city, state, address')
        .in('id', churchIds);

      if (churchesData) {
        churches = churchesData.reduce((acc, c) => ({ ...acc, [c.id]: c }), {});
      }
    }

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
            profiles[userId] = { id: userId, email };
          }
        }
      });
    }

    const claimsWithDetails = claims?.map(claim => ({
      ...claim,
      church: churches[claim.church_id] || null,
      user: profiles[claim.user_id] || null,
      reviewer: claim.reviewed_by_user_id ? profiles[claim.reviewed_by_user_id] || null : null,
      platform,
    })) || [];

    const pendingCount = claims?.filter(c => c.status === 'pending').length || 0;
    const approvedCount = claims?.filter(c => c.status === 'approved').length || 0;
    const rejectedCount = claims?.filter(c => c.status === 'rejected').length || 0;

    return res.status(200).json({
      platform,
      claims: claimsWithDetails,
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        total: claims?.length || 0,
      },
    });

  } catch (error) {
    console.error('Error in GET /api/admin/city-platforms/:id/church-claims:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
