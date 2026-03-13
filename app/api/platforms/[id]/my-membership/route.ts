import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import type { UserMembershipStatus } from "@shared/schema";

export async function GET(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      const status: UserMembershipStatus = {
        isMember: false,
        hasPendingRequest: false,
      };
      return res.status(200).json(status);
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      const status: UserMembershipStatus = {
        isMember: false,
        hasPendingRequest: false,
      };
      return res.status(200).json(status);
    }

    const { id: platformId } = req.params;

    const { data: platform, error: platformError } = await adminClient
      .from('city_platforms')
      .select('id')
      .eq('id', platformId)
      .single();

    if (platformError) {
      if (platformError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Platform not found' });
      }
      console.error('Error fetching platform:', platformError);
      return res.status(500).json({ error: 'Failed to fetch platform' });
    }

    // Check if user is a super_admin (implicit member of all platforms)
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (isSuperAdmin) {
      const status: UserMembershipStatus = {
        isMember: true,
        hasPendingRequest: false,
        role: 'super_admin',
      };
      return res.status(200).json(status);
    }

    const { data: membership } = await adminClient
      .from('city_platform_users')
      .select('id, role, is_active')
      .eq('city_platform_id', platformId)
      .eq('user_id', user.id)
      .single();

    if (membership?.is_active) {
      const status: UserMembershipStatus = {
        isMember: true,
        hasPendingRequest: false,
        role: membership.role,
      };
      return res.status(200).json(status);
    }

    const { data: pendingRequest } = await adminClient
      .from('platform_membership_requests')
      .select('*')
      .eq('platform_id', platformId)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .single();

    const status: UserMembershipStatus = {
      isMember: false,
      hasPendingRequest: !!pendingRequest,
      request: pendingRequest || undefined,
    };

    return res.status(200).json(status);

  } catch (error) {
    console.error('Error in GET /api/platforms/:id/my-membership:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
