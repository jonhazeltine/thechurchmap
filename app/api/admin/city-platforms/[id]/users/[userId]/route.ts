import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../../lib/supabaseServer";
import { z } from "zod";

const updateUserSchema = z.object({
  role: z.enum(['platform_owner', 'platform_admin', 'church_admin', 'member']).optional(),
  church_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
  can_manage_boundaries: z.boolean().optional(),
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

function canModifyUser(
  currentUserRole: string, 
  targetUserRole: string, 
  newRole?: string
): boolean {
  const roleHierarchy: Record<string, number> = {
    'super_admin': 5,
    'platform_owner': 4,
    'platform_admin': 3,
    'church_admin': 2,
    'member': 1,
  };

  const currentLevel = roleHierarchy[currentUserRole] || 0;
  const targetLevel = roleHierarchy[targetUserRole] || 0;

  if (currentLevel <= targetLevel) {
    return false;
  }

  if (newRole) {
    const newRoleLevel = roleHierarchy[newRole] || 0;
    if (currentUserRole === 'platform_owner') {
      return newRoleLevel <= roleHierarchy['platform_admin'];
    }
    if (currentUserRole === 'platform_admin') {
      return newRoleLevel <= roleHierarchy['member'];
    }
    if (currentUserRole === 'super_admin') {
      return true;
    }
    return false;
  }

  return true;
}

export async function PATCH(req: Request, res: Response) {
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

    const { id: platformIdOrSlug, userId: targetUserId } = req.params;

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

    const parseResult = updateUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { role: newRole, church_id, is_active, can_manage_boundaries } = parseResult.data;

    const { data: targetPlatformUser, error: fetchError } = await adminClient
      .from('city_platform_users')
      .select('id, role, user_id, church_id, is_active')
      .eq('city_platform_id', platformId)
      .eq('user_id', targetUserId)
      .single();

    if (fetchError || !targetPlatformUser) {
      return res.status(404).json({ error: 'User not found in this platform' });
    }

    const currentRole = isSuperAdmin ? 'super_admin' : userRole;
    if (!currentRole || !canModifyUser(currentRole, targetPlatformUser.role, newRole)) {
      return res.status(403).json({ 
        error: `You don't have permission to modify this user` 
      });
    }

    if (newRole === 'church_admin' && church_id === undefined && !targetPlatformUser.church_id) {
      return res.status(400).json({ 
        error: 'church_id is required for church_admin role' 
      });
    }

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (newRole !== undefined) {
      updateData.role = newRole;
    }

    if (church_id !== undefined) {
      updateData.church_id = church_id;
    }

    if (is_active !== undefined) {
      updateData.is_active = is_active;
    }

    // Only super admins can grant/revoke boundary management permission
    if (can_manage_boundaries !== undefined) {
      if (!isSuperAdmin) {
        return res.status(403).json({ 
          error: 'Only super admins can modify boundary management permissions' 
        });
      }
      updateData.can_manage_boundaries = can_manage_boundaries;
    }

    const { data: updatedUser, error: updateError } = await adminClient
      .from('city_platform_users')
      .update(updateData)
      .eq('id', targetPlatformUser.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating user:', updateError);
      return res.status(500).json({ error: 'Failed to update user' });
    }

    const { data: profile } = await adminClient
      .from('profiles')
      .select('id, full_name, first_name, last_name, avatar_url')
      .eq('id', targetUserId)
      .single();

    const { data: authUser } = await adminClient.auth.admin.getUserById(targetUserId);

    let church = null;
    if (updatedUser.church_id) {
      const { data: churchData } = await adminClient
        .from('churches')
        .select('id, name')
        .eq('id', updatedUser.church_id)
        .single();
      church = churchData;
    }

    const result = {
      ...updatedUser,
      profile: profile ? { ...profile, email: authUser?.user?.email } : {
        id: targetUserId,
        full_name: authUser?.user?.user_metadata?.full_name || null,
        first_name: authUser?.user?.user_metadata?.first_name || null,
        last_name: authUser?.user?.user_metadata?.last_name || null,
        avatar_url: authUser?.user?.user_metadata?.avatar_url || null,
        email: authUser?.user?.email,
      },
      church,
    };

    return res.status(200).json(result);

  } catch (error) {
    console.error('Error in PATCH /api/admin/city-platforms/:id/users/:userId:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function DELETE(req: Request, res: Response) {
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

    const { id: platformIdOrSlug, userId: targetUserId } = req.params;

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

    const { data: targetPlatformUser, error: fetchError } = await adminClient
      .from('city_platform_users')
      .select('id, role, user_id')
      .eq('city_platform_id', platformId)
      .eq('user_id', targetUserId)
      .single();

    if (fetchError || !targetPlatformUser) {
      return res.status(404).json({ error: 'User not found in this platform' });
    }

    const currentRole = isSuperAdmin ? 'super_admin' : userRole;
    if (!currentRole || !canModifyUser(currentRole, targetPlatformUser.role)) {
      return res.status(403).json({ 
        error: `You don't have permission to remove this user` 
      });
    }

    const { error: deleteError } = await adminClient
      .from('city_platform_users')
      .delete()
      .eq('id', targetPlatformUser.id);

    if (deleteError) {
      console.error('Error deleting user:', deleteError);
      return res.status(500).json({ error: 'Failed to remove user from platform' });
    }

    return res.status(200).json({ 
      success: true, 
      message: 'User removed from platform successfully' 
    });

  } catch (error) {
    console.error('Error in DELETE /api/admin/city-platforms/:id/users/:userId:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
