import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../../lib/supabaseServer";
import { updateCommentStatusSchema } from "@shared/schema";

// Helper to check if user has admin access (checks both platform_roles and city_platform_users tables)
async function checkAdminAccess(adminClient: ReturnType<typeof supabaseServer>, userId: string) {
  // Check legacy platform_roles table
  const { data: platformRoles } = await adminClient
    .from('platform_roles')
    .select('role, city_platform_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  const hasLegacyAdminRole = platformRoles?.some(r => 
    r.role === 'super_admin' || r.role === 'platform_owner' || r.role === 'platform_admin'
  );

  // Check new city_platform_users table
  const { data: platformUsers } = await adminClient
    .from('city_platform_users')
    .select('role, city_platform_id')
    .eq('user_id', userId)
    .in('role', ['platform_owner', 'platform_admin']);

  const hasPlatformUserRole = (platformUsers?.length || 0) > 0;

  console.log('🔐 Comment moderation auth check:', { 
    userId, 
    legacyRolesFound: platformRoles?.length || 0,
    legacyRoles: platformRoles?.map(r => r.role),
    platformUsersFound: platformUsers?.length || 0,
    platformUserRoles: platformUsers?.map(r => r.role),
    hasAccess: hasLegacyAdminRole || hasPlatformUserRole
  });

  return hasLegacyAdminRole || hasPlatformUserRole;
}

export async function DELETE(request: Request, response: Response) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const { commentId } = request.params;
    
    // Verify JWT with user client (for auth)
    const userClient = supabaseUserClient(token);
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    
    if (authError || !user) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    // Use service role client for permission checks (bypasses RLS)
    const adminClient = supabaseServer();

    // Check if user is super admin or platform admin
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    
    if (!isSuperAdmin) {
      const hasAdminRole = await checkAdminAccess(adminClient, user.id);

      if (!hasAdminRole) {
        return response.status(403).json({ error: 'Forbidden - Admin only' });
      }
    }
    const { error } = await adminClient
      .from('post_comments')
      .delete()
      .eq('id', commentId);

    if (error) {
      console.error('Error deleting comment:', error);
      return response.status(500).json({ error: 'Failed to delete comment' });
    }

    return response.status(200).json({ success: true });

  } catch (error) {
    console.error('Error in delete comment:', error);
    return response.status(500).json({ error: 'Internal server error' });
  }
}

export async function PATCH(request: Request, response: Response) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const { commentId } = request.params;
    const body = request.body;
    
    // Validate request body - admin status update only
    const validation = updateCommentStatusSchema.safeParse(body);
    if (!validation.success) {
      return response.status(400).json({ error: 'Invalid request body', details: validation.error });
    }
    
    // Verify JWT with user client (for auth)
    const userClient = supabaseUserClient(token);
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    
    if (authError || !user) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    // Use service role client for permission checks (bypasses RLS)
    const adminClient = supabaseServer();

    // Check if user is super admin or platform admin
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    
    if (!isSuperAdmin) {
      const hasAdminRole = await checkAdminAccess(adminClient, user.id);

      if (!hasAdminRole) {
        return response.status(403).json({ error: 'Forbidden - Admin only' });
      }
    }

    const { data, error } = await adminClient
      .from('post_comments')
      .update({
        ...validation.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', commentId)
      .select()
      .single();

    if (error) {
      console.error('Error updating comment:', error);
      return response.status(500).json({ error: 'Failed to update comment' });
    }

    return response.status(200).json(data);

  } catch (error) {
    console.error('Error in update comment:', error);
    return response.status(500).json({ error: 'Internal server error' });
  }
}
