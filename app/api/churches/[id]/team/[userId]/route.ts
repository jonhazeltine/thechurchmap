import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";
import { z } from "zod";

const updateTeamMemberSchema = z.object({
  role: z.enum(['member', 'church_admin']).optional(),
  is_approved: z.boolean().optional(),
}).refine(data => data.role !== undefined || data.is_approved !== undefined, {
  message: "At least one field (role or is_approved) must be provided"
});

// PATCH /api/churches/:id/team/:userId - Update team member role or approval status
export async function PATCH(req: Request, res: Response) {
  try {
    const { id: churchId, userId } = req.params;
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    
    // Verify user
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check permissions: super admin, platform admin, or church admin of THIS church
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    
    let isPlatformAdmin = false;
    if (!isSuperAdmin) {
      const { data: platformRole } = await adminClient
        .from('platform_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'platform_admin')
        .maybeSingle();
      isPlatformAdmin = !!platformRole;
    }
    
    const { data: churchRole } = await adminClient
      .from('church_user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('church_id', churchId)
      .eq('role', 'church_admin')
      .eq('is_approved', true)
      .maybeSingle();
    
    const isChurchAdmin = !!churchRole;
    
    if (!isSuperAdmin && !isPlatformAdmin && !isChurchAdmin) {
      return res.status(403).json({ error: 'Forbidden - must be admin of this church' });
    }

    // Validate request body
    const validation = updateTeamMemberSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.error.errors 
      });
    }

    const updates = validation.data;

    // Prevent self-demotion (unless super admin)
    if (userId === user.id && updates.role === 'member' && !isSuperAdmin) {
      return res.status(400).json({ 
        error: 'Cannot demote yourself. Please have another admin change your role.' 
      });
    }

    // Build update object
    const updateData: any = {};
    if (updates.role !== undefined) {
      updateData.role = updates.role;
    }
    if (updates.is_approved !== undefined) {
      updateData.is_approved = updates.is_approved;
      if (updates.is_approved) {
        updateData.approved_by_user_id = user.id;
      }
    }

    // If demoting from church_admin to member, also release the claim
    if (updates.role === 'member') {
      // Find and release all claims this user has on this church
      const { error: releaseError } = await adminClient
        .from('city_platform_churches')
        .update({
          is_claimed: false,
          claimed_by_user_id: null,
          claimed_at: null,
        })
        .eq('church_id', churchId)
        .eq('claimed_by_user_id', userId);
      
      if (releaseError) {
        console.error('Error releasing claim on demotion:', releaseError);
        // Continue with the role update even if claim release fails
      } else {
        console.log(`Released claim for user ${userId} on church ${churchId}`);
      }
    }

    // Update team member
    const { data: updatedMember, error: updateError } = await adminClient
      .from('church_user_roles')
      .update(updateData)
      .eq('user_id', userId)
      .eq('church_id', churchId)
      .select(`
        id,
        user_id,
        church_id,
        role,
        is_approved,
        created_at,
        updated_at,
        profiles:user_id (
          id,
          full_name,
          first_name,
          last_initial
        )
      `)
      .single();

    if (updateError) {
      console.error('Error updating team member:', updateError);
      return res.status(500).json({ error: 'Failed to update team member' });
    }

    // Get email
    const { data: { user: authUser } } = await adminClient.auth.admin.getUserById(userId);

    return res.status(200).json({
      ...updatedMember,
      email: authUser?.email || null,
    });

  } catch (error) {
    console.error('Error in update team member:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// DELETE /api/churches/:id/team/:userId - Remove team member
export async function DELETE(req: Request, res: Response) {
  try {
    const { id: churchId, userId } = req.params;
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    
    // Verify user
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check permissions: super admin, platform admin, or church admin of THIS church
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    
    let isPlatformAdmin = false;
    if (!isSuperAdmin) {
      const { data: platformRole } = await adminClient
        .from('platform_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'platform_admin')
        .maybeSingle();
      isPlatformAdmin = !!platformRole;
    }
    
    const { data: churchRole } = await adminClient
      .from('church_user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('church_id', churchId)
      .eq('role', 'church_admin')
      .eq('is_approved', true)
      .maybeSingle();
    
    const isChurchAdmin = !!churchRole;
    
    if (!isSuperAdmin && !isPlatformAdmin && !isChurchAdmin) {
      return res.status(403).json({ error: 'Forbidden - must be admin of this church' });
    }

    // Prevent self-removal (unless super admin)
    if (userId === user.id && !isSuperAdmin) {
      return res.status(400).json({ 
        error: 'Cannot remove yourself from the team. Please have another admin remove you.' 
      });
    }

    let removedFromAnySource = false;

    // 1. Release any claims this user has on this church in city_platform_churches
    const { data: releasedClaim, error: releaseError } = await adminClient
      .from('city_platform_churches')
      .update({
        is_claimed: false,
        claimed_by_user_id: null,
        claimed_at: null,
      })
      .eq('church_id', churchId)
      .eq('claimed_by_user_id', userId)
      .select();
    
    if (releaseError) {
      console.error('Error releasing claim on removal:', releaseError);
    } else if (releasedClaim && releasedClaim.length > 0) {
      console.log(`Released claim for user ${userId} on church ${churchId}`);
      removedFromAnySource = true;
    }

    // 2. Delete from church_user_roles (legacy table)
    const { data: deletedLegacy, error: legacyDeleteError } = await adminClient
      .from('church_user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('church_id', churchId)
      .select();

    if (legacyDeleteError) {
      console.error('Error removing from church_user_roles:', legacyDeleteError);
    } else if (deletedLegacy && deletedLegacy.length > 0) {
      console.log(`Removed from church_user_roles: user ${userId} church ${churchId}`);
      removedFromAnySource = true;
    }

    // 3. Delete from city_platform_users (new table) where role = church_admin
    const { data: deletedCPU, error: cpuDeleteError } = await adminClient
      .from('city_platform_users')
      .delete()
      .eq('user_id', userId)
      .eq('church_id', churchId)
      .select();

    if (cpuDeleteError) {
      console.error('Error removing from city_platform_users:', cpuDeleteError);
    } else if (deletedCPU && deletedCPU.length > 0) {
      console.log(`Removed from city_platform_users: user ${userId} church ${churchId}`);
      removedFromAnySource = true;
    }

    if (!removedFromAnySource) {
      console.log(`User ${userId} was not found in any team table for church ${churchId}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Team member removed successfully',
    });

  } catch (error) {
    console.error('Error in remove team member:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
