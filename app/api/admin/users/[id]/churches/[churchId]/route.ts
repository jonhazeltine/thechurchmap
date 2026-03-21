import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../../lib/supabaseServer";

// DELETE /api/admin/users/:id/churches/:churchId - Remove user from church
export async function DELETE(req: Request, res: Response) {
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

    // Get user ID and church ID from Express params
    const userId = req.params.id;
    const churchId = req.params.churchId;

    if (!userId || !churchId) {
      return res.status(400).json({ error: 'User ID and Church ID required' });
    }

    // Check if requesting user has permission:
    // 1. Super admin can remove anyone from any church
    // 2. Platform admin can remove users from churches in their platform
    // 3. Church admin can remove users from their own church
    const isSuperAdmin = user.user_metadata?.super_admin === true;

    if (!isSuperAdmin) {
      // Check if user is platform admin for platform containing this church
      const { data: church } = await adminClient
        .from('churches')
        .select('id')
        .eq('id', churchId)
        .single();

      if (!church) {
        return res.status(404).json({ error: 'Church not found' });
      }

      // Check if user is church admin for this church
      const { data: churchAdminRole } = await adminClient
        .from('church_user_roles')
        .select('id')
        .eq('user_id', user.id)
        .eq('church_id', churchId)
        .eq('role', 'church_admin')
        .eq('is_approved', true)
        .single();

      // Check if user is platform admin (for any platform)
      const { data: platformRoles } = await adminClient
        .from('city_platform_users')
        .select('city_platform_id, role')
        .eq('user_id', user.id)
        .in('role', ['super_admin', 'platform_owner', 'platform_admin'])
        .eq('is_active', true);

      const isPlatformAdmin = platformRoles && platformRoles.length > 0;
      const isChurchAdmin = !!churchAdminRole;

      if (!isPlatformAdmin && !isChurchAdmin) {
        return res.status(403).json({ error: 'Admin access required to remove users from churches' });
      }

      // Prevent church admin from removing themselves (they should transfer ownership first)
      if (isChurchAdmin && !isPlatformAdmin && userId === user.id) {
        return res.status(400).json({ error: 'Cannot remove yourself from the church. Transfer admin rights first.' });
      }
    }

    // Delete church user role
    const { error: deleteError } = await adminClient
      .from('church_user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('church_id', churchId);

    if (deleteError) {
      console.error('Error removing user from church:', deleteError);
      return res.status(500).json({ error: 'Failed to remove user from church' });
    }

    return res.status(200).json({
      success: true,
      message: 'User removed from church successfully',
    });

  } catch (error) {
    console.error('Error in remove user from church:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
