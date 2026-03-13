import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../../lib/supabaseServer";
import { updateMembershipRequestSchema } from "@shared/schema";

async function checkPlatformAccess(
  adminClient: ReturnType<typeof supabaseServer>,
  userId: string,
  platformId: string,
  userMetadata: any
): Promise<{ hasAccess: boolean; isSuperAdmin: boolean; userRole: string | null }> {
  const isSuperAdmin = userMetadata?.super_admin === true;
  
  if (isSuperAdmin) {
    return { hasAccess: true, isSuperAdmin: true, userRole: 'super_admin' };
  }

  const { data: userRole } = await adminClient
    .from('city_platform_users')
    .select('role')
    .eq('city_platform_id', platformId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('role', ['platform_owner', 'platform_admin'])
    .single();

  return { 
    hasAccess: !!userRole, 
    isSuperAdmin: false, 
    userRole: userRole?.role || null 
  };
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

    const { id: platformId, requestId } = req.params;

    const { hasAccess } = await checkPlatformAccess(
      adminClient,
      user.id,
      platformId,
      user.user_metadata
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this platform' });
    }

    const { data: request, error: requestError } = await adminClient
      .from('platform_membership_requests')
      .select('*')
      .eq('id', requestId)
      .eq('platform_id', platformId)
      .single();

    if (requestError) {
      if (requestError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Membership request not found' });
      }
      console.error('Error fetching membership request:', requestError);
      return res.status(500).json({ error: 'Failed to fetch membership request' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: 'This request has already been processed' });
    }

    const parseResult = updateMembershipRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { status, reviewer_notes } = parseResult.data;

    const { data: updatedRequest, error: updateError } = await adminClient
      .from('platform_membership_requests')
      .update({
        status,
        reviewer_notes,
        reviewed_by_user_id: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating membership request:', updateError);
      return res.status(500).json({ error: 'Failed to update membership request' });
    }

    if (status === 'approved') {
      const { data: existingMember } = await adminClient
        .from('city_platform_users')
        .select('id, is_active')
        .eq('city_platform_id', platformId)
        .eq('user_id', request.user_id)
        .single();

      if (existingMember) {
        if (!existingMember.is_active) {
          await adminClient
            .from('city_platform_users')
            .update({
              is_active: true,
              role: 'member',
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingMember.id);
        }
      } else {
        const { error: insertError } = await adminClient
          .from('city_platform_users')
          .insert({
            city_platform_id: platformId,
            user_id: request.user_id,
            role: 'member',
            is_active: true,
          });

        if (insertError) {
          console.error('Error creating platform user:', insertError);
          return res.status(500).json({ error: 'Request approved but failed to add user to platform' });
        }
      }
    }

    return res.status(200).json({
      message: status === 'approved' ? 'Membership request approved' : 'Membership request rejected',
      request: updatedRequest,
    });

  } catch (error) {
    console.error('Error in PATCH /api/admin/platform/:id/membership-requests/:requestId:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
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

    const { id: platformId, requestId } = req.params;

    const { hasAccess } = await checkPlatformAccess(
      adminClient,
      user.id,
      platformId,
      user.user_metadata
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this platform' });
    }

    const { data: request, error: requestError } = await adminClient
      .from('platform_membership_requests')
      .select('*')
      .eq('id', requestId)
      .eq('platform_id', platformId)
      .single();

    if (requestError) {
      if (requestError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Membership request not found' });
      }
      console.error('Error fetching membership request:', requestError);
      return res.status(500).json({ error: 'Failed to fetch membership request' });
    }

    const { data: userProfile } = await adminClient
      .from('profiles')
      .select('id, full_name, first_name, last_name, avatar_url')
      .eq('id', request.user_id)
      .single();

    let userEmail = null;
    try {
      const { data: authUser } = await adminClient.auth.admin.getUserById(request.user_id);
      userEmail = authUser?.user?.email || null;
    } catch (err) {
      console.error('Error fetching user email:', err);
    }

    return res.status(200).json({
      ...request,
      user: {
        id: request.user_id,
        ...(userProfile || {}),
        email: userEmail,
      },
    });

  } catch (error) {
    console.error('Error in GET /api/admin/platform/:id/membership-requests/:requestId:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
