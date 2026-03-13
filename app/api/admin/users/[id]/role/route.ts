import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";

// PATCH /api/admin/users/:id/role - Update user super_admin status (super admin only)
export async function PATCH(req: Request, res: Response) {
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

    // Check if requesting user is super admin
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    // Get user ID from Express params
    const userId = req.params.id;

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // Parse request body (already parsed by Express body-parser)
    const { super_admin } = req.body;

    if (typeof super_admin !== 'boolean') {
      return res.status(400).json({ error: 'super_admin must be a boolean' });
    }

    // Update user metadata
    const { data: updatedUser, error: updateError } = await adminClient.auth.admin.updateUserById(
      userId,
      {
        user_metadata: {
          super_admin,
        }
      }
    );

    if (updateError) {
      console.error('Error updating user metadata:', updateError);
      return res.status(500).json({ error: 'Failed to update user role' });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: updatedUser.user.id,
        email: updatedUser.user.email,
        is_super_admin: updatedUser.user.user_metadata?.super_admin === true,
      }
    });

  } catch (error) {
    console.error('Error in update user role:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
