import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";
import { z } from "zod";

const assignChurchSchema = z.object({
  church_id: z.string().uuid("Invalid church ID"),
  role: z.enum(['member', 'church_admin'], {
    errorMap: () => ({ message: "Role must be either 'member' or 'church_admin'" })
  }),
});

// POST /api/admin/users/:id/churches - Assign user to church with role (super admin only)
export async function POST(req: Request, res: Response) {
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

    // Validate request body
    const validation = assignChurchSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.error.errors 
      });
    }

    const { church_id, role } = validation.data;

    // Check if church exists
    const { data: church, error: churchError } = await adminClient
      .from('churches')
      .select('id, name')
      .eq('id', church_id)
      .single();

    if (churchError || !church) {
      return res.status(404).json({ error: 'Church not found' });
    }

    // Check if user is already assigned to this church
    const { data: existingRole } = await adminClient
      .from('church_user_roles')
      .select('id')
      .eq('user_id', userId)
      .eq('church_id', church_id)
      .single();

    if (existingRole) {
      return res.status(400).json({ error: 'User is already assigned to this church' });
    }

    // Insert church user role (auto-approved since super admin is assigning)
    const { data: newRole, error: insertError } = await adminClient
      .from('church_user_roles')
      .insert({
        user_id: userId,
        church_id,
        role,
        is_approved: true,
        approved_by_user_id: user.id,
      })
      .select(`
        id,
        user_id,
        church_id,
        role,
        is_approved,
        created_at,
        updated_at,
        church:churches(
          id,
          name,
          city,
          state,
          denomination
        )
      `)
      .single();

    if (insertError) {
      console.error('Error assigning user to church:', insertError);
      return res.status(500).json({ error: 'Failed to assign user to church' });
    }

    return res.status(200).json({
      success: true,
      church_role: newRole,
    });

  } catch (error) {
    console.error('Error in assign user to church:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// DELETE /api/admin/users/:id/churches/:churchId - Remove user from church (super admin only)
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

    // Check if requesting user is super admin
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    // Get user ID and church ID from Express params
    const userId = req.params.id;
    const churchId = req.params.churchId;

    if (!userId || !churchId) {
      return res.status(400).json({ error: 'User ID and Church ID required' });
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
