import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";

/**
 * POST /api/churches/:id/claim/release
 * Releases management of a church, making it available to be claimed by someone else.
 * Does NOT delete church data - only removes the claim and church_admin role.
 */
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

    const { id: churchId } = req.params;
    const { platform_id } = req.body;

    if (!platform_id || typeof platform_id !== 'string') {
      return res.status(400).json({ error: 'platform_id is required in request body' });
    }

    // Verify user is actually a church admin for this church (check both tables + claimer)
    const { data: legacyAdmin } = await adminClient
      .from('church_user_roles')
      .select('id, role')
      .eq('church_id', churchId)
      .eq('user_id', user.id)
      .eq('role', 'church_admin')
      .eq('is_approved', true)
      .maybeSingle();

    const { data: cpuAdmin } = await adminClient
      .from('city_platform_users')
      .select('id, role')
      .eq('church_id', churchId)
      .eq('user_id', user.id)
      .eq('role', 'church_admin')
      .eq('is_active', true)
      .maybeSingle();

    // Also check if user is the claimer of this church
    const { data: platformChurch } = await adminClient
      .from('city_platform_churches')
      .select('claimed_by_user_id')
      .eq('church_id', churchId)
      .eq('city_platform_id', platform_id)
      .eq('claimed_by_user_id', user.id)
      .eq('is_claimed', true)
      .maybeSingle();

    const isClaimer = !!platformChurch;

    if (!legacyAdmin && !cpuAdmin && !isClaimer) {
      return res.status(403).json({ error: 'You are not an administrator of this church' });
    }

    // Find any approved claim for this church/platform by the current user
    const { data: claim } = await adminClient
      .from('church_claims')
      .select('id, status, user_id')
      .eq('church_id', churchId)
      .eq('city_platform_id', platform_id)
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .maybeSingle();

    // If a claim record exists, try to update it to released, or delete if that fails
    if (claim) {
      const { error: updateClaimError } = await adminClient
        .from('church_claims')
        .update({ 
          status: 'released',
          updated_at: new Date().toISOString()
        })
        .eq('id', claim.id);

      if (updateClaimError) {
        console.error('Error updating claim status (may be CHECK constraint):', updateClaimError);
        // Fallback: delete the claim record if update fails (e.g., CHECK constraint doesn't allow 'released')
        const { error: deleteClaimError } = await adminClient
          .from('church_claims')
          .delete()
          .eq('id', claim.id);
        
        if (deleteClaimError) {
          console.error('Error deleting claim as fallback:', deleteClaimError);
        } else {
          console.log('[Release] Claim deleted as fallback since status update failed');
        }
      }
    }
    // Note: If user is claimer via city_platform_churches but no church_claims record exists,
    // we still proceed to release (they became claim holder through another path)

    // Update city_platform_churches to mark as unclaimed - this is the critical operation
    const { error: updatePlatformChurchError, data: updateData } = await adminClient
      .from('city_platform_churches')
      .update({ 
        is_claimed: false,
        claimed_by_user_id: null 
      })
      .eq('church_id', churchId)
      .eq('city_platform_id', platform_id)
      .select('id');
    
    const count = updateData?.length ?? 0;

    if (updatePlatformChurchError) {
      console.error('Error updating platform church:', updatePlatformChurchError);
      return res.status(500).json({ error: 'Failed to release church. Please try again.' });
    }
    
    console.log(`[Release] city_platform_churches updated, count: ${count}`);
    
    // Check if any rows were updated - if count is 0, the church/platform link doesn't exist
    if (count === 0) {
      console.error('[Release] No city_platform_churches row found for update');
      return res.status(404).json({ error: 'Church not found in this platform.' });
    }
    
    // Verify the update worked by checking is_claimed is now false
    const { data: verifyPlatformChurch } = await adminClient
      .from('city_platform_churches')
      .select('is_claimed')
      .eq('church_id', churchId)
      .eq('city_platform_id', platform_id)
      .maybeSingle();
    
    if (verifyPlatformChurch?.is_claimed) {
      console.error('[Release] is_claimed still true after update - release failed');
      return res.status(500).json({ error: 'Failed to release church. Please try again.' });
    }

    // Remove user from church_user_roles for this church
    const { error: removeRoleError } = await adminClient
      .from('church_user_roles')
      .delete()
      .eq('church_id', churchId)
      .eq('user_id', user.id);

    if (removeRoleError) {
      console.error('Error removing from church_user_roles:', removeRoleError);
      // Don't fail entirely, the claim was already updated
    }

    // Also remove from city_platform_users church_admin role for this church
    const { error: removePlatformRoleError } = await adminClient
      .from('city_platform_users')
      .delete()
      .eq('city_platform_id', platform_id)
      .eq('user_id', user.id)
      .eq('role', 'church_admin')
      .eq('church_id', churchId);

    if (removePlatformRoleError) {
      console.error('Error removing from city_platform_users:', removePlatformRoleError);
    }

    return res.status(200).json({ 
      message: 'Church management released successfully. The church can now be claimed by someone else.',
      released: true
    });

  } catch (error) {
    console.error('Error in POST /api/churches/:id/claim/release:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
