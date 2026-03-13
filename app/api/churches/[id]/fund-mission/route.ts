import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import type { FundMissionPageData, Sponsor, SponsorAssignment } from "@shared/schema";

export async function GET(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const adminClient = supabaseServer();

    // First, fetch basic church data (columns that definitely exist)
    const { data: church, error: churchError } = await adminClient
      .from('churches')
      .select(`
        id,
        name,
        address,
        city,
        state,
        zip,
        claimed_by,
        profile_photo_url,
        banner_image_url,
        description,
        collaboration_have,
        collaboration_need
      `)
      .eq('id', id)
      .single();

    if (churchError || !church) {
      console.error('Error fetching church for fund-mission:', churchError);
      return res.status(404).json({ error: 'Church not found' });
    }

    // Get city_platform_id from church_platform_status table if it exists
    let cityPlatformId: string | null = null;
    try {
      const { data: platformStatus } = await adminClient
        .from('church_platform_status')
        .select('city_platform_id')
        .eq('church_id', id)
        .eq('status', 'visible')
        .limit(1)
        .single();
      if (platformStatus?.city_platform_id) {
        cityPlatformId = platformStatus.city_platform_id;
      }
    } catch (e) {
      // Church not linked to any platform or table doesn't exist
    }

    // Try to fetch partnership_status separately (may not exist if migration not run)
    let partnershipStatus = 'unclaimed';
    try {
      const { data: statusData } = await adminClient
        .from('churches')
        .select('partnership_status')
        .eq('id', id)
        .single();
      if (statusData?.partnership_status) {
        partnershipStatus = statusData.partnership_status;
      }
    } catch (e) {
      // Column doesn't exist yet, use default
      console.log('partnership_status column not found, using default: unclaimed');
    }

    // Check for existing claims (pending or approved)
    let hasExistingClaim = false;
    try {
      const { data: existingClaim, error: claimError } = await adminClient
        .from('church_claims')
        .select('id, status')
        .eq('church_id', id)
        .in('status', ['pending', 'approved'])
        .limit(1)
        .maybeSingle();
      
      if (!claimError && existingClaim) {
        hasExistingClaim = true;
      }
    } catch (e) {
      // church_claims table might not exist yet
      console.log('church_claims table not found, continuing');
    }

    const { data: churchCallings, error: callingsError } = await adminClient
      .from('church_calling')
      .select(`
        callings:calling_id (
          id,
          name,
          type,
          description
        )
      `)
      .eq('church_id', id);

    if (callingsError) {
      console.error('Error fetching callings:', callingsError);
    }

    const callings = (churchCallings || [])
      .filter((cc: any) => cc.callings)
      .map((cc: any) => cc.callings);

    const now = new Date().toISOString();
    const sponsors: Array<Sponsor & { assignment: SponsorAssignment }> = [];

    // Try to fetch sponsors - tables may not exist if migration not run yet
    try {
      const { data: platformSponsors, error: platformError } = await adminClient
        .from('sponsors')
        .select('*')
        .eq('level', 'platform')
        .eq('is_active', true);

      if (!platformError && platformSponsors) {
        for (const sponsor of platformSponsors) {
          sponsors.push({
            ...sponsor,
            assignment: {
              id: '',
              sponsor_id: sponsor.id,
              church_id: null,
              city_platform_id: null,
              display_from: now,
              display_to: null,
              is_active: true,
              created_at: now,
              updated_at: now,
            }
          });
        }
      }

      if (cityPlatformId) {
        const { data: regionalAssignments, error: regionalError } = await adminClient
          .from('sponsor_assignments')
          .select(`
            *,
            sponsor:sponsor_id (*)
          `)
          .eq('city_platform_id', cityPlatformId)
          .eq('is_active', true)
          .lte('display_from', now)
          .or(`display_to.is.null,display_to.gte.${now}`);

        if (!regionalError && regionalAssignments) {
          for (const assignment of regionalAssignments) {
            if (assignment.sponsor && assignment.sponsor.is_active && assignment.sponsor.level === 'regional') {
              const { sponsor, ...assignmentData } = assignment;
              sponsors.push({
                ...sponsor,
                assignment: assignmentData
              });
            }
          }
        }
      }

      // Fetch sponsors directly assigned to this specific church (any level)
      const { data: churchAssignments, error: churchAssignError } = await adminClient
        .from('sponsor_assignments')
        .select(`
          *,
          sponsor:sponsor_id (*)
        `)
        .eq('church_id', id)
        .eq('is_active', true)
        .lte('display_from', now)
        .or(`display_to.is.null,display_to.gte.${now}`);

      if (!churchAssignError && churchAssignments) {
        for (const assignment of churchAssignments) {
          // Include any active sponsor assigned to this church, regardless of level
          if (assignment.sponsor && assignment.sponsor.is_active) {
            // Check if sponsor is already in the list (from platform/regional queries)
            const alreadyExists = sponsors.some(s => s.id === assignment.sponsor.id);
            if (!alreadyExists) {
              const { sponsor, ...assignmentData } = assignment;
              sponsors.push({
                ...sponsor,
                assignment: assignmentData
              });
            }
          }
        }
      }
    } catch (e) {
      // Sponsor tables don't exist yet, continue with empty sponsors
      console.log('Sponsor tables not found, continuing with empty sponsors list');
    }

    sponsors.sort((a, b) => a.sort_order - b.sort_order);

    const medianHomePrice = 400000; // Default median home price, can be enhanced with ACS data later

    const pageData: FundMissionPageData = {
      church: {
        id: church.id,
        name: church.name,
        address: church.address,
        city: church.city,
        state: church.state,
        claimed_by: church.claimed_by,
        partnership_status: partnershipStatus as any,
        profile_photo_url: church.profile_photo_url,
        banner_image_url: church.banner_image_url,
        description: church.description,
      },
      callings,
      collaborationHave: church.collaboration_have || [],
      collaborationNeed: church.collaboration_need || [],
      sponsors,
      isClaimed: !!church.claimed_by,
      hasExistingClaim,
      isPartnershipActive: partnershipStatus === 'active',
      medianHomePrice,
    };

    return res.json(pageData);
  } catch (error) {
    console.error('Error in GET /api/churches/:id/fund-mission:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
