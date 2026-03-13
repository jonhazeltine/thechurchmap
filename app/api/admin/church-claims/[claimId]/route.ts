import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { updateChurchClaimSchema } from "@shared/schema";

async function checkClaimAccess(
  adminClient: ReturnType<typeof supabaseServer>,
  userId: string,
  claimId: string,
  userMetadata: any
): Promise<{ hasAccess: boolean; isSuperAdmin: boolean; claim: any | null }> {
  const isSuperAdmin = userMetadata?.super_admin === true;

  const { data: claim, error } = await adminClient
    .from('church_claims')
    .select('*')
    .eq('id', claimId)
    .single();

  if (error || !claim) {
    return { hasAccess: false, isSuperAdmin, claim: null };
  }
  
  if (isSuperAdmin) {
    return { hasAccess: true, isSuperAdmin: true, claim };
  }

  const { data: userRole } = await adminClient
    .from('city_platform_users')
    .select('role')
    .eq('city_platform_id', claim.city_platform_id)
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('role', ['platform_owner', 'platform_admin'])
    .single();

  return { hasAccess: !!userRole, isSuperAdmin: false, claim };
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

    const { claimId } = req.params;

    const { hasAccess, claim } = await checkClaimAccess(
      adminClient,
      user.id,
      claimId,
      user.user_metadata
    );

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data: church } = await adminClient
      .from('churches')
      .select('id, name, city, state, address')
      .eq('id', claim.church_id)
      .single();

    const { data: platform } = await adminClient
      .from('city_platforms')
      .select('id, name, slug')
      .eq('id', claim.city_platform_id)
      .single();

    const { data: claimantProfile } = await adminClient
      .from('profiles')
      .select('id, full_name, first_name, last_name, avatar_url')
      .eq('id', claim.user_id)
      .single();

    let claimantEmail = null;
    try {
      const { data: authUser } = await adminClient.auth.admin.getUserById(claim.user_id);
      claimantEmail = authUser?.user?.email || null;
    } catch (err) {
      console.error('Error fetching claimant email:', err);
    }

    let reviewer = null;
    if (claim.reviewed_by_user_id) {
      const { data: reviewerProfile } = await adminClient
        .from('profiles')
        .select('id, full_name, first_name, last_name')
        .eq('id', claim.reviewed_by_user_id)
        .single();
      reviewer = reviewerProfile;
    }

    return res.status(200).json({
      ...claim,
      church: church || null,
      platform: platform || null,
      user: claimantProfile ? { ...claimantProfile, email: claimantEmail } : null,
      reviewer,
    });

  } catch (error) {
    console.error('Error in GET /api/admin/church-claims/:claimId:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
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

    const { claimId } = req.params;

    const { hasAccess, claim } = await checkClaimAccess(
      adminClient,
      user.id,
      claimId,
      user.user_metadata
    );

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (claim.status !== 'pending') {
      return res.status(400).json({ 
        error: `Cannot update claim: it has already been ${claim.status}` 
      });
    }

    const parseResult = updateChurchClaimSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { status, reviewer_notes } = parseResult.data;

    // Pre-validate all conditions BEFORE updating claim status (for approval)
    if (status === 'approved') {
      // Validate church-platform association before approving
      const { data: platformChurchLink, error: linkCheckError } = await adminClient
        .from('city_platform_churches')
        .select('id')
        .eq('church_id', claim.church_id)
        .eq('city_platform_id', claim.city_platform_id)
        .single();

      if (linkCheckError || !platformChurchLink) {
        return res.status(400).json({
          error: 'Church is not linked to this city platform. Cannot approve claim.',
        });
      }

      // Note: Users CAN administer multiple churches on the same platform
      // The data model supports this via the unique index on (city_platform_id, user_id, role, church_id)
      // Each church_admin role is a separate record with its own church_id
    }

    // Now that validation passed, update the claim status
    const { data: updatedClaim, error: updateError } = await adminClient
      .from('church_claims')
      .update({
        status,
        reviewer_notes: reviewer_notes || null,
        reviewed_by_user_id: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', claimId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating claim:', updateError);
      return res.status(500).json({ error: 'Failed to update claim' });
    }

    // Perform the approval actions now that status is updated
    if (status === 'approved') {
      // Check if user already has a church_admin role for this platform+church combo
      const { data: existingChurchAdminRole } = await adminClient
        .from('city_platform_users')
        .select('id, role, church_id, is_active')
        .eq('city_platform_id', claim.city_platform_id)
        .eq('user_id', claim.user_id)
        .eq('role', 'church_admin')
        .eq('church_id', claim.church_id)
        .single();

      if (existingChurchAdminRole) {
        // User already has church_admin for this specific church - just reactivate if needed
        if (!existingChurchAdminRole.is_active) {
          const { error: reactivateError } = await adminClient
            .from('city_platform_users')
            .update({
              is_active: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingChurchAdminRole.id);

          if (reactivateError) {
            console.error('Error reactivating church admin role:', reactivateError);
          }
        }
      } else {
        // Insert NEW church_admin role record (preserving any existing platform_owner/platform_admin roles)
        // The unique index is on (city_platform_id, user_id, role), so multiple roles per platform are allowed
        const { error: insertError } = await adminClient
          .from('city_platform_users')
          .insert({
            city_platform_id: claim.city_platform_id,
            user_id: claim.user_id,
            role: 'church_admin',
            church_id: claim.church_id,
            is_active: true,
          });

        if (insertError) {
          console.error('Error creating church admin role:', insertError);
        }
      }

      // Update the platform church to mark as claimed and make visible
      const { error: platformChurchError } = await adminClient
        .from('city_platform_churches')
        .update({
          status: 'visible',
          is_claimed: true,
          claimed_by_user_id: claim.user_id,
          claimed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('church_id', claim.church_id)
        .eq('city_platform_id', claim.city_platform_id);

      if (platformChurchError) {
        console.error('Error updating platform church:', platformChurchError);
      }

      // Also approve the church itself
      const { error: churchApproveError } = await adminClient
        .from('churches')
        .update({
          approved: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', claim.church_id);

      if (churchApproveError) {
        console.error('Error approving church:', churchApproveError);
      }

      const { error: churchRoleError } = await adminClient
        .from('church_roles')
        .upsert({
          church_id: claim.church_id,
          user_id: claim.user_id,
          role: 'church_admin',
          is_approved: true,
          approved_by_user_id: user.id,
          approved_at: new Date().toISOString(),
        }, {
          onConflict: 'church_id,user_id',
        });

      if (churchRoleError) {
        console.error('Error creating church role:', churchRoleError);
      }
    } else if (status === 'rejected') {
      // Rollback wizard data that was applied when the claim was submitted
      
      // 1. Clear the church's collaboration tags
      const { error: collaborationError } = await adminClient
        .from('churches')
        .update({
          collaboration_have: [],
          collaboration_need: [],
          updated_at: new Date().toISOString(),
        })
        .eq('id', claim.church_id);

      if (collaborationError) {
        console.error('Error clearing collaboration tags:', collaborationError);
      }

      // 2. Delete all church_calling records for this church
      const { error: callingError } = await adminClient
        .from('church_calling')
        .delete()
        .eq('church_id', claim.church_id);

      if (callingError) {
        console.error('Error deleting church_calling records:', callingError);
      }
    }

    const { data: church } = await adminClient
      .from('churches')
      .select('id, name')
      .eq('id', claim.church_id)
      .single();

    return res.status(200).json({
      message: status === 'approved' 
        ? `Claim approved. User is now the admin for ${church?.name || 'this church'}.`
        : 'Claim rejected.',
      claim: updatedClaim,
    });

  } catch (error) {
    console.error('Error in PATCH /api/admin/church-claims/:claimId:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
