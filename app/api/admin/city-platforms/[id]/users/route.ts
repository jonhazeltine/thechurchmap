import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";
import { z } from "zod";

const addUserSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['platform_owner', 'platform_admin', 'church_admin', 'member']),
  church_id: z.string().uuid().optional().nullable(),
});

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

function canAssignRole(currentUserRole: string, targetRole: string): boolean {
  const roleHierarchy: Record<string, number> = {
    'super_admin': 5,
    'platform_owner': 4,
    'platform_admin': 3,
    'church_admin': 2,
    'member': 1,
  };

  const currentLevel = roleHierarchy[currentUserRole] || 0;
  const targetLevel = roleHierarchy[targetRole] || 0;

  if (currentUserRole === 'super_admin') {
    return true;
  }

  if (currentUserRole === 'platform_owner') {
    return targetLevel <= roleHierarchy['platform_admin'];
  }

  if (currentUserRole === 'platform_admin') {
    return targetLevel <= roleHierarchy['member'];
  }

  return false;
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

    // First resolve platform by either UUID or slug
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(platformIdOrSlug);
    const { data: platform, error: platformError } = await adminClient
      .from('city_platforms')
      .select('id, name')
      .eq(isUUID ? 'id' : 'slug', platformIdOrSlug)
      .single();

    if (platformError) {
      if (platformError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Platform not found' });
      }
      console.error('Error fetching platform:', platformError);
      return res.status(500).json({ error: 'Failed to fetch platform' });
    }

    // Use the actual platform UUID for all subsequent queries
    const platformId = platform.id;

    const { hasAccess } = await checkPlatformAccess(
      adminClient,
      user.id,
      platformId,
      user.user_metadata
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this platform' });
    }

    const { data: platformUsers, error: usersError } = await adminClient
      .from('city_platform_users')
      .select(`
        id,
        city_platform_id,
        user_id,
        role,
        church_id,
        is_active,
        can_manage_boundaries,
        created_at,
        updated_at
      `)
      .eq('city_platform_id', platformId)
      .order('created_at', { ascending: false });

    if (usersError) {
      console.error('Error fetching platform users:', usersError);
      return res.status(500).json({ error: 'Failed to fetch platform users' });
    }

    const userIds = platformUsers?.map(u => u.user_id) || [];
    const churchIds = platformUsers?.filter(u => u.church_id).map(u => u.church_id) || [];

    let profiles: Record<string, any> = {};
    let churches: Record<string, any> = {};

    if (userIds.length > 0) {
      const { data: profilesData } = await adminClient
        .from('profiles')
        .select('id, full_name, first_name, last_name, avatar_url')
        .in('id', userIds);

      if (profilesData) {
        profiles = profilesData.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
      }

      // Fetch email for each user individually (secure - only gets platform members)
      // Use Promise.allSettled to handle any individual failures gracefully
      const userEmailPromises = userIds.map(async (userId) => {
        try {
          const { data: authUser } = await adminClient.auth.admin.getUserById(userId);
          if (authUser?.user) {
            return { userId, email: authUser.user.email, metadata: authUser.user.user_metadata };
          }
          return { userId, email: null, metadata: null };
        } catch (err) {
          console.error(`Error fetching auth user ${userId}:`, err);
          return { userId, email: null, metadata: null };
        }
      });

      const userEmailResults = await Promise.allSettled(userEmailPromises);
      userEmailResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          const { userId, email, metadata } = result.value;
          if (profiles[userId]) {
            profiles[userId].email = email;
          } else {
            profiles[userId] = {
              id: userId,
              full_name: metadata?.full_name || null,
              first_name: metadata?.first_name || null,
              last_name: metadata?.last_name || null,
              avatar_url: metadata?.avatar_url || null,
              email: email,
            };
          }
        }
      });
    }

    if (churchIds.length > 0) {
      const { data: churchesData } = await adminClient
        .from('churches')
        .select('id, name')
        .in('id', churchIds);

      if (churchesData) {
        churches = churchesData.reduce((acc, c) => ({ ...acc, [c.id]: c }), {});
      }
    }

    const usersWithProfiles = platformUsers?.map(pu => ({
      ...pu,
      profile: profiles[pu.user_id] || null,
      church: pu.church_id ? churches[pu.church_id] || null : null,
    })) || [];

    return res.status(200).json({
      platform,
      users: usersWithProfiles,
    });

  } catch (error) {
    console.error('Error in GET /api/admin/city-platforms/:id/users:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function POST(req: Request, res: Response) {
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

    // First resolve platform by either UUID or slug
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(platformIdOrSlug);
    const { data: platform, error: platformError } = await adminClient
      .from('city_platforms')
      .select('id, name')
      .eq(isUUID ? 'id' : 'slug', platformIdOrSlug)
      .single();

    if (platformError) {
      if (platformError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Platform not found' });
      }
      console.error('Error fetching platform:', platformError);
      return res.status(500).json({ error: 'Failed to fetch platform' });
    }

    // Use the actual platform UUID for all subsequent queries
    const platformId = platform.id;

    const { hasAccess, userRole, isSuperAdmin } = await checkPlatformAccess(
      adminClient,
      user.id,
      platformId,
      user.user_metadata
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this platform' });
    }

    const parseResult = addUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { user_id, role, church_id } = parseResult.data;

    const currentRole = isSuperAdmin ? 'super_admin' : userRole;
    if (!currentRole || !canAssignRole(currentRole, role)) {
      return res.status(403).json({ 
        error: `You don't have permission to assign the ${role} role` 
      });
    }

    if (role === 'church_admin' && !church_id) {
      return res.status(400).json({ 
        error: 'church_id is required for church_admin role' 
      });
    }

    const { data: existingUser } = await adminClient
      .from('city_platform_users')
      .select('id, is_active')
      .eq('city_platform_id', platformId)
      .eq('user_id', user_id)
      .single();

    if (existingUser) {
      if (existingUser.is_active) {
        return res.status(409).json({ error: 'User is already a member of this platform' });
      }
      const { data: reactivatedUser, error: reactivateError } = await adminClient
        .from('city_platform_users')
        .update({
          is_active: true,
          role,
          church_id: church_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingUser.id)
        .select()
        .single();

      if (reactivateError) {
        console.error('Error reactivating user:', reactivateError);
        return res.status(500).json({ error: 'Failed to add user to platform' });
      }

      return res.status(201).json(reactivatedUser);
    }

    const { data: targetUser } = await adminClient.auth.admin.getUserById(user_id);
    if (!targetUser?.user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { data: newPlatformUser, error: insertError } = await adminClient
      .from('city_platform_users')
      .insert({
        city_platform_id: platformId,
        user_id,
        role,
        church_id: church_id || null,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error adding user:', insertError);
      return res.status(500).json({ error: 'Failed to add user to platform' });
    }

    const { data: profile } = await adminClient
      .from('profiles')
      .select('id, full_name, first_name, last_name, avatar_url')
      .eq('id', user_id)
      .single();

    const result = {
      ...newPlatformUser,
      profile: profile ? { ...profile, email: targetUser.user.email } : {
        id: user_id,
        full_name: targetUser.user.user_metadata?.full_name || null,
        first_name: targetUser.user.user_metadata?.first_name || null,
        last_name: targetUser.user.user_metadata?.last_name || null,
        avatar_url: targetUser.user.user_metadata?.avatar_url || null,
        email: targetUser.user.email,
      },
      church: null,
    };

    if (church_id) {
      const { data: church } = await adminClient
        .from('churches')
        .select('id, name')
        .eq('id', church_id)
        .single();
      result.church = church;
    }

    return res.status(201).json(result);

  } catch (error) {
    console.error('Error in POST /api/admin/city-platforms/:id/users:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
