import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../../lib/supabaseServer";
import { updateCommentStatusSchema } from "@shared/schema";

// Helper to check if user has admin access (uses city_platform_users as canonical source)
async function checkAdminAccess(adminClient: ReturnType<typeof supabaseServer>, userId: string) {
  const { data: platformRoles } = await adminClient
    .from('city_platform_users')
    .select('role, city_platform_id')
    .eq('user_id', userId)
    .in('role', ['super_admin', 'platform_owner', 'platform_admin'])
    .eq('is_active', true);

  const hasAdminRole = (platformRoles || []).length > 0;

  console.log('🔐 Comment moderation auth check:', {
    userId,
    rolesFound: platformRoles?.length || 0,
    roles: platformRoles?.map(r => r.role),
    hasAccess: hasAdminRole
  });

  return hasAdminRole;
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
