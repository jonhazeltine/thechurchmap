import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { insertChurchClaimSchema } from "@shared/schema";
import { z } from "zod";

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

    const { id: churchId } = req.params;
    const { platform_id } = req.query;

    if (!platform_id || typeof platform_id !== 'string') {
      const { data: platformChurches, error: platformsError } = await adminClient
        .from('city_platform_churches')
        .select(`
          city_platform_id,
          is_claimed,
          claimed_by_user_id,
          city_platform:city_platforms(id, name, slug)
        `)
        .eq('church_id', churchId);

      if (platformsError) {
        console.error('Error fetching church platforms:', platformsError);
        return res.status(500).json({ error: 'Failed to fetch church platforms' });
      }

      // Get all pending claims for this church across all platforms
      const { data: allPendingClaims } = await adminClient
        .from('church_claims')
        .select('city_platform_id, user_id')
        .eq('church_id', churchId)
        .eq('status', 'pending');

      const pendingClaimsByPlatform = new Map<string, { hasPending: boolean; byCurrentUser: boolean }>();
      (allPendingClaims || []).forEach((claim: any) => {
        const existing = pendingClaimsByPlatform.get(claim.city_platform_id);
        if (!existing) {
          pendingClaimsByPlatform.set(claim.city_platform_id, {
            hasPending: true,
            byCurrentUser: claim.user_id === user.id,
          });
        } else if (claim.user_id === user.id) {
          existing.byCurrentUser = true;
        }
      });

      const platforms = (platformChurches || []).map((pc: any) => {
        const pendingInfo = pendingClaimsByPlatform.get(pc.city_platform_id);
        return {
          id: pc.city_platform?.id,
          name: pc.city_platform?.name,
          slug: pc.city_platform?.slug,
          is_claimed: pc.is_claimed,
          claimed_by_current_user: pc.claimed_by_user_id === user.id,
          has_pending_claim: pendingInfo?.hasPending || false,
          pending_claim_by_current_user: pendingInfo?.byCurrentUser || false,
        };
      }).filter((p: any) => p.id);

      return res.status(200).json({
        platforms,
        church_id: churchId,
      });
    }

    // Get current user's claim
    const { data: userClaim, error: userClaimError } = await adminClient
      .from('church_claims')
      .select('*')
      .eq('church_id', churchId)
      .eq('city_platform_id', platform_id)
      .eq('user_id', user.id)
      .single();

    if (userClaimError && userClaimError.code !== 'PGRST116') {
      console.error('Error fetching user claim:', userClaimError);
      return res.status(500).json({ error: 'Failed to check claim status' });
    }

    // Check if ANY user has a pending claim for this church/platform
    const { data: pendingClaims, error: pendingClaimError } = await adminClient
      .from('church_claims')
      .select('id, user_id, status')
      .eq('church_id', churchId)
      .eq('city_platform_id', platform_id)
      .eq('status', 'pending');

    if (pendingClaimError) {
      console.error('Error fetching pending claims:', pendingClaimError);
    }

    const hasPendingClaim = (pendingClaims || []).length > 0;
    const pendingClaimByOtherUser = (pendingClaims || []).some(c => c.user_id !== user.id);

    const { data: platformChurch } = await adminClient
      .from('city_platform_churches')
      .select('is_claimed, claimed_by_user_id')
      .eq('church_id', churchId)
      .eq('city_platform_id', platform_id)
      .single();

    // If claimed, get the claimant's name
    let claimant_name: string | null = null;
    if (platformChurch?.is_claimed && platformChurch?.claimed_by_user_id) {
      const { data: claimantUser } = await adminClient
        .from('user_profiles')
        .select('display_name, full_name')
        .eq('id', platformChurch.claimed_by_user_id)
        .single();
      
      claimant_name = claimantUser?.display_name || claimantUser?.full_name || 'Another user';
    }

    return res.status(200).json({
      claim: userClaim || null,
      is_claimed: platformChurch?.is_claimed || false,
      claimed_by_current_user: platformChurch?.claimed_by_user_id === user.id,
      has_pending_claim: hasPendingClaim,
      pending_claim_by_other_user: pendingClaimByOtherUser,
      claimant_name,
    });

  } catch (error) {
    console.error('Error in GET /api/churches/:id/claim:', error);
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

    const { id: churchId } = req.params;

    const bodyWithChurchId = { ...req.body, church_id: churchId };
    const parseResult = insertChurchClaimSchema.safeParse(bodyWithChurchId);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { city_platform_id, role_at_church, phone, verification_notes, wizard_data } = parseResult.data;

    console.log('[Claim] Processing claim:', { churchId, city_platform_id, userId: user.id });

    const { data: church, error: churchError } = await adminClient
      .from('churches')
      .select('id, name')
      .eq('id', churchId)
      .single();

    if (churchError || !church) {
      console.error('[Claim] Church not found:', { churchId, churchError });
      return res.status(404).json({ error: 'Church not found' });
    }

    const { data: platformChurch, error: platformChurchError } = await adminClient
      .from('city_platform_churches')
      .select('id, is_claimed, claimed_by_user_id')
      .eq('church_id', churchId)
      .eq('city_platform_id', city_platform_id)
      .single();

    if (platformChurchError || !platformChurch) {
      console.error('[Claim] Church not linked to platform:', { 
        churchId, 
        churchName: church.name,
        city_platform_id, 
        platformChurchError 
      });
      return res.status(404).json({ error: 'Church is not part of this platform' });
    }

    // Check if church is already claimed
    if (platformChurch.is_claimed) {
      // Check if current user is the claimer - this could be a stale state
      if (platformChurch.claimed_by_user_id === user.id) {
        // User is already the claimer - check if they have an approved claim record
        const { data: existingApprovedClaim } = await adminClient
          .from('church_claims')
          .select('id, status')
          .eq('church_id', churchId)
          .eq('city_platform_id', city_platform_id)
          .eq('user_id', user.id)
          .eq('status', 'approved')
          .maybeSingle();
        
        if (existingApprovedClaim) {
          return res.status(409).json({ 
            error: 'You already manage this church. Use the release feature to give up management first.',
            claim_id: existingApprovedClaim.id 
          });
        }
        
        // User is claimer but no approved claim exists - stale state
        // Clear the is_claimed flag and let them reclaim
        console.log('[Claim] Stale is_claimed state - user is claimer but no approved claim exists. Clearing.');
        const { error: clearError } = await adminClient
          .from('city_platform_churches')
          .update({ is_claimed: false, claimed_by_user_id: null })
          .eq('church_id', churchId)
          .eq('city_platform_id', city_platform_id);
        
        if (clearError) {
          console.error('[Claim] Error clearing stale is_claimed:', clearError);
          return res.status(500).json({ error: 'Failed to reset stale claim state. Please try again.' });
        }
        // Fall through to allow fresh claim
      } else {
        // Someone else is the claimer
        return res.status(409).json({ error: 'This church has already been claimed by another user' });
      }
    }

    const { data: existingClaim, error: existingClaimError } = await adminClient
      .from('church_claims')
      .select('id, status')
      .eq('church_id', churchId)
      .eq('city_platform_id', city_platform_id)
      .eq('user_id', user.id)
      .single();

    if (existingClaim) {
      if (existingClaim.status === 'pending') {
        return res.status(409).json({ 
          error: 'You already have a pending claim for this church',
          claim_id: existingClaim.id 
        });
      }
      // If claim is approved but the church is not marked as claimed in city_platform_churches,
      // treat it as a stale approved claim and allow re-claiming
      if (existingClaim.status === 'approved') {
        // Church is still claimed - can't reclaim
        if (platformChurch.is_claimed) {
          return res.status(409).json({ 
            error: 'You already have an approved claim for this church. Use the release feature to give up management first.',
            claim_id: existingClaim.id 
          });
        }
        // Church is not claimed but claim is approved - this is stale, delete and allow fresh claim
        console.log('[Claim] Found stale approved claim, deleting to allow reclaim:', existingClaim.id);
        const { error: deleteError } = await adminClient
          .from('church_claims')
          .delete()
          .eq('id', existingClaim.id);
        
        if (deleteError) {
          console.error('[Claim] Error deleting stale claim:', deleteError);
          return res.status(500).json({ error: 'Failed to reset stale claim. Please try again.' });
        }
        // Proceed to insert fresh claim below (existingClaim is now null effectively)
        // Set to null so we skip the rejected/released handling and go straight to insert
      }
      // Allow re-claiming for rejected or released claims
      if (existingClaim.status === 'rejected' || existingClaim.status === 'released') {
        const { data: updatedClaim, error: updateError } = await adminClient
          .from('church_claims')
          .update({
            status: 'pending',
            role_at_church,
            phone: phone || null,
            verification_notes,
            wizard_data: wizard_data || null,
            reviewer_notes: null,
            reviewed_by_user_id: null,
            reviewed_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingClaim.id)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating claim:', updateError);
          return res.status(500).json({ error: 'Failed to resubmit claim' });
        }

        // Immediately apply wizard data to the church on resubmission
        if (wizard_data) {
          try {
            const parsedWizardData = typeof wizard_data === 'string' ? JSON.parse(wizard_data) : wizard_data;
            const { specificCallings, collaborationHave, collaborationNeed } = parsedWizardData;

            // Update church with collaboration tags
            if (collaborationHave || collaborationNeed) {
              const churchUpdate: any = {};
              if (collaborationHave && Array.isArray(collaborationHave)) {
                churchUpdate.collaboration_have = collaborationHave;
              }
              if (collaborationNeed && Array.isArray(collaborationNeed)) {
                churchUpdate.collaboration_need = collaborationNeed;
              }
              
              if (Object.keys(churchUpdate).length > 0) {
                const { error: churchUpdateError } = await adminClient
                  .from('churches')
                  .update(churchUpdate)
                  .eq('id', churchId);
                
                if (churchUpdateError) {
                  console.error('Error updating church collaboration data:', churchUpdateError);
                }
              }
            }

            // Lookup callings by name and insert church_calling records
            if (specificCallings && Array.isArray(specificCallings) && specificCallings.length > 0) {
              const { data: callingsData, error: callingsError } = await adminClient
                .from('callings')
                .select('id, name')
                .in('name', specificCallings);

              if (callingsError) {
                console.error('Error fetching callings:', callingsError);
              } else if (callingsData && callingsData.length > 0) {
                const callingInserts = callingsData.map((calling: { id: string; name: string }) => ({
                  church_id: churchId,
                  calling_id: calling.id,
                }));

                const { error: callingInsertError } = await adminClient
                  .from('church_calling')
                  .insert(callingInserts);

                if (callingInsertError) {
                  console.error('Error inserting church callings:', callingInsertError);
                }
              }
            }
          } catch (wizardError) {
            console.error('Error applying wizard data:', wizardError);
          }
        }

        return res.status(200).json({
          message: 'Claim resubmitted successfully',
          claim: updatedClaim,
        });
      }
    }

    const { data: newClaim, error: insertError } = await adminClient
      .from('church_claims')
      .insert({
        church_id: churchId,
        city_platform_id,
        user_id: user.id,
        status: 'pending',
        role_at_church,
        phone: phone || null,
        verification_notes,
        wizard_data: wizard_data || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating claim:', insertError);
      if (insertError.code === '23505') {
        return res.status(409).json({ error: 'You already have a claim for this church' });
      }
      return res.status(500).json({ error: 'Failed to submit claim' });
    }

    // Immediately apply wizard data to the church
    if (wizard_data) {
      try {
        const parsedWizardData = typeof wizard_data === 'string' ? JSON.parse(wizard_data) : wizard_data;
        const { specificCallings, collaborationHave, collaborationNeed } = parsedWizardData;

        // Update church with collaboration tags
        if (collaborationHave || collaborationNeed) {
          const churchUpdate: any = {};
          if (collaborationHave && Array.isArray(collaborationHave)) {
            churchUpdate.collaboration_have = collaborationHave;
          }
          if (collaborationNeed && Array.isArray(collaborationNeed)) {
            churchUpdate.collaboration_need = collaborationNeed;
          }
          
          if (Object.keys(churchUpdate).length > 0) {
            const { error: churchUpdateError } = await adminClient
              .from('churches')
              .update(churchUpdate)
              .eq('id', churchId);
            
            if (churchUpdateError) {
              console.error('Error updating church collaboration data:', churchUpdateError);
            }
          }
        }

        // Lookup callings by name and insert church_calling records
        if (specificCallings && Array.isArray(specificCallings) && specificCallings.length > 0) {
          const { data: callingsData, error: callingsError } = await adminClient
            .from('callings')
            .select('id, name')
            .in('name', specificCallings);

          if (callingsError) {
            console.error('Error fetching callings:', callingsError);
          } else if (callingsData && callingsData.length > 0) {
            const callingInserts = callingsData.map((calling: { id: string; name: string }) => ({
              church_id: churchId,
              calling_id: calling.id,
            }));

            const { error: callingInsertError } = await adminClient
              .from('church_calling')
              .insert(callingInserts);

            if (callingInsertError) {
              console.error('Error inserting church callings:', callingInsertError);
            }
          }
        }
      } catch (wizardError) {
        console.error('Error applying wizard data:', wizardError);
      }
    }

    return res.status(201).json({
      message: 'Claim submitted successfully. A platform administrator will review your request.',
      claim: newClaim,
    });

  } catch (error) {
    console.error('Error in POST /api/churches/:id/claim:', error);
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

    const { id: churchId } = req.params;
    const { platform_id } = req.query;

    if (!platform_id || typeof platform_id !== 'string') {
      return res.status(400).json({ error: 'platform_id query parameter is required' });
    }

    const { data: claim, error: fetchError } = await adminClient
      .from('church_claims')
      .select('id, status')
      .eq('church_id', churchId)
      .eq('city_platform_id', platform_id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    if (claim.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending claims can be cancelled' });
    }

    const { error: deleteError } = await adminClient
      .from('church_claims')
      .delete()
      .eq('id', claim.id);

    if (deleteError) {
      console.error('Error deleting claim:', deleteError);
      return res.status(500).json({ error: 'Failed to cancel claim' });
    }

    // Rollback wizard data that was applied to the church
    try {
      // Clear collaboration tags
      const { error: churchUpdateError } = await adminClient
        .from('churches')
        .update({
          collaboration_have: [],
          collaboration_need: [],
          updated_at: new Date().toISOString(),
        })
        .eq('id', churchId);

      if (churchUpdateError) {
        console.error('Error clearing church collaboration data on cancellation:', churchUpdateError);
      }

      // Delete church_calling records
      const { error: callingDeleteError } = await adminClient
        .from('church_calling')
        .delete()
        .eq('church_id', churchId);

      if (callingDeleteError) {
        console.error('Error deleting church callings on cancellation:', callingDeleteError);
      }
    } catch (rollbackError) {
      console.error('Error rolling back wizard data on claim cancellation:', rollbackError);
    }

    return res.status(200).json({ message: 'Claim cancelled successfully' });

  } catch (error) {
    console.error('Error in DELETE /api/churches/:id/claim:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
