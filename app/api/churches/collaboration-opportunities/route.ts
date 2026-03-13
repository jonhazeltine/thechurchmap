import type { Request, Response } from 'express';
import { supabaseServer } from '../../../../lib/supabaseServer';

async function verifyChurchAdmin(token: string, churchId: string): Promise<{ authorized: boolean; userId?: string; error?: string }> {
  const adminClient = supabaseServer();
  
  const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !user) {
    return { authorized: false, error: 'Unauthorized' };
  }

  const isSuperAdminMetadata = user.user_metadata?.super_admin === true;

  const { data: roles } = await adminClient
    .from('city_platform_users')
    .select('role, church_id, city_platform_id, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true);

  const rolesList = roles || [];

  const isSuperAdmin = isSuperAdminMetadata || rolesList.some((r: any) => r.role === 'super_admin');
  if (isSuperAdmin) {
    return { authorized: true, userId: user.id };
  }

  const isPlatformAdmin = rolesList.some((r: any) => 
    ['platform_owner', 'platform_admin'].includes(r.role)
  );

  if (isPlatformAdmin) {
    const { data: churchPlatforms } = await adminClient
      .from('city_platform_churches')
      .select('city_platform_id')
      .eq('church_id', churchId);

    const churchPlatformIds = (churchPlatforms || []).map((cp: any) => cp.city_platform_id);
    const adminsPlatforms = rolesList
      .filter((r: any) => ['platform_owner', 'platform_admin'].includes(r.role))
      .map((r: any) => r.city_platform_id);

    if (adminsPlatforms.some((pid: string) => churchPlatformIds.includes(pid))) {
      return { authorized: true, userId: user.id };
    }
  }

  const isChurchAdmin = rolesList.some((r: any) => 
    r.role === 'church_admin' && r.church_id === churchId
  );
  if (isChurchAdmin) {
    return { authorized: true, userId: user.id };
  }

  return { authorized: false, error: 'Not authorized for this church' };
}

interface CollaborationOpportunity {
  partner_id: string;
  partner_name: string;
  partner_city: string | null;
  partner_profile_photo_url: string | null;
  area_overlap_pct: number;
  shared_callings_count: number;
  collab_matches_count: number;
  distance_miles: number | null;
  total_score: number;
  score_breakdown: {
    area_overlap: number;
    callings: number;
    have_need: number;
    distance: number;
  };
}

interface ActiveCollaboration {
  id: string;
  partner_id: string;
  partner_name: string;
  partner_city: string | null;
  partner_profile_photo_url: string | null;
  status: 'pending' | 'active' | 'paused' | 'ended';
  description: string | null;
  created_at: string;
  started_at: string | null;
  initiated_by_me: boolean;
}

export async function GET(req: Request, res: Response) {
  try {
    const { churchId, limit = '20' } = req.query;
    
    if (!churchId || typeof churchId !== 'string') {
      return res.status(400).json({ error: 'churchId is required' });
    }

    const supabase = supabaseServer();
    const parsedLimit = Math.min(parseInt(limit as string) || 20, 50);

    // Get collaboration opportunities using the RPC function
    const { data: opportunities, error: oppError } = await supabase
      .rpc('fn_get_collaboration_opportunities', {
        p_church_id: churchId,
        p_limit: parsedLimit
      });

    if (oppError) {
      console.error('Error fetching collaboration opportunities:', oppError);
      // Fall back to simpler query if RPC doesn't exist yet
      return res.json({
        opportunities: [],
        activeCollaborations: [],
        pendingCollaborations: [],
        message: 'Collaboration scoring not yet available'
      });
    }

    // Get active/pending collaborations for this church
    const { data: collaborations, error: collabError } = await supabase
      .from('active_collaborations')
      .select(`
        id,
        church_a_id,
        church_b_id,
        status,
        description,
        created_at,
        started_at,
        initiated_by
      `)
      .or(`church_a_id.eq.${churchId},church_b_id.eq.${churchId}`)
      .in('status', ['pending', 'active', 'paused']);

    // Get partner church details for collaborations
    let activeCollaborations: ActiveCollaboration[] = [];
    let pendingCollaborations: ActiveCollaboration[] = [];

    if (collaborations && collaborations.length > 0) {
      const partnerIds = collaborations.map(c => 
        c.church_a_id === churchId ? c.church_b_id : c.church_a_id
      );

      const { data: partners } = await supabase
        .from('churches')
        .select('id, name, city, profile_photo_url')
        .in('id', partnerIds);

      const partnerMap = new Map(partners?.map(p => [p.id, p]) || []);

      for (const collab of collaborations) {
        const partnerId = collab.church_a_id === churchId ? collab.church_b_id : collab.church_a_id;
        const partner = partnerMap.get(partnerId);

        const collabData: ActiveCollaboration = {
          id: collab.id,
          partner_id: partnerId,
          partner_name: partner?.name || 'Unknown Church',
          partner_city: partner?.city || null,
          partner_profile_photo_url: partner?.profile_photo_url || null,
          status: collab.status,
          description: collab.description,
          created_at: collab.created_at,
          started_at: collab.started_at,
          initiated_by_me: collab.initiated_by === churchId
        };

        if (collab.status === 'pending') {
          pendingCollaborations.push(collabData);
        } else {
          activeCollaborations.push(collabData);
        }
      }
    }

    // Format opportunities
    const formattedOpportunities: CollaborationOpportunity[] = (opportunities || []).map((opp: any) => ({
      partner_id: opp.partner_id,
      partner_name: opp.partner_name,
      partner_city: opp.partner_city,
      partner_profile_photo_url: opp.partner_profile_photo_url,
      area_overlap_pct: parseFloat(opp.area_overlap_pct) || 0,
      shared_callings_count: opp.shared_callings_count || 0,
      collab_matches_count: opp.collab_matches_count || 0,
      distance_miles: opp.distance_miles ? parseFloat(opp.distance_miles) : null,
      total_score: parseFloat(opp.total_score) || 0,
      score_breakdown: opp.score_breakdown || {
        area_overlap: 0,
        callings: 0,
        have_need: 0,
        distance: 0
      }
    }));

    return res.json({
      opportunities: formattedOpportunities,
      activeCollaborations,
      pendingCollaborations,
      metadata: {
        totalOpportunities: formattedOpportunities.length,
        totalActive: activeCollaborations.length,
        totalPending: pendingCollaborations.length
      }
    });

  } catch (error: any) {
    console.error('Collaboration opportunities error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

// Create a new collaboration request
export async function POST(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.substring(7);

    const { churchId, partnerId, description } = req.body;
    
    if (!churchId || !partnerId) {
      return res.status(400).json({ error: 'churchId and partnerId are required' });
    }

    // Verify user is admin of the initiating church
    const authResult = await verifyChurchAdmin(token, churchId);
    if (!authResult.authorized) {
      return res.status(403).json({ error: authResult.error || 'Not authorized for this church' });
    }

    const supabase = supabaseServer();

    // Ensure consistent ordering (church_a_id < church_b_id)
    const [church_a_id, church_b_id] = churchId < partnerId 
      ? [churchId, partnerId] 
      : [partnerId, churchId];

    // Check if collaboration already exists
    const { data: existing } = await supabase
      .from('active_collaborations')
      .select('id, status')
      .eq('church_a_id', church_a_id)
      .eq('church_b_id', church_b_id)
      .single();

    if (existing) {
      if (existing.status === 'ended') {
        // Reactivate ended collaboration
        const { data: updated, error } = await supabase
          .from('active_collaborations')
          .update({
            status: 'pending',
            initiated_by: churchId,
            description,
            ended_at: null
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        return res.json({ collaboration: updated, reactivated: true });
      }
      return res.status(409).json({ 
        error: 'Collaboration already exists',
        status: existing.status 
      });
    }

    // Create new collaboration
    const { data: collaboration, error } = await supabase
      .from('active_collaborations')
      .insert({
        church_a_id,
        church_b_id,
        initiated_by: churchId,
        description,
        status: 'pending',
        created_by: authResult.userId,
        updated_by: authResult.userId
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ collaboration });

  } catch (error: any) {
    console.error('Create collaboration error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

// Update collaboration status
export async function PATCH(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = authHeader.substring(7);

    const { collaborationId, status, description } = req.body;
    
    if (!collaborationId) {
      return res.status(400).json({ error: 'collaborationId is required' });
    }

    const supabase = supabaseServer();

    // Fetch the collaboration to get church IDs
    const { data: existingCollab } = await supabase
      .from('active_collaborations')
      .select('church_a_id, church_b_id')
      .eq('id', collaborationId)
      .single();

    if (!existingCollab) {
      return res.status(404).json({ error: 'Collaboration not found' });
    }

    // Verify user is admin of either church
    const authResultA = await verifyChurchAdmin(token, existingCollab.church_a_id);
    const authResultB = await verifyChurchAdmin(token, existingCollab.church_b_id);
    
    if (!authResultA.authorized && !authResultB.authorized) {
      return res.status(403).json({ error: 'Not authorized for either church in this collaboration' });
    }

    // Track who is making this update
    const userId = authResultA.userId || authResultB.userId;
    
    const updateData: any = {
      updated_by: userId
    };
    if (status) {
      updateData.status = status;
      if (status === 'active') {
        updateData.started_at = new Date().toISOString();
      } else if (status === 'ended') {
        updateData.ended_at = new Date().toISOString();
      }
    }
    if (description !== undefined) {
      updateData.description = description;
    }

    const { data: collaboration, error } = await supabase
      .from('active_collaborations')
      .update(updateData)
      .eq('id', collaborationId)
      .select()
      .single();

    if (error) throw error;

    return res.json({ collaboration });

  } catch (error: any) {
    console.error('Update collaboration error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
