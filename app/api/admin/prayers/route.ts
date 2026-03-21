import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function GET(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const status = req.query.status as string | undefined;
    const cityPlatformId = req.query.city_platform_id as string | undefined;
    
    // Verify JWT
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is super admin or platform admin
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    
    // Check for platform admin role
    const { data: platformRoles } = await adminClient
      .from('city_platform_users')
      .select('city_platform_id, role')
      .eq('user_id', user.id)
      .in('role', ['super_admin', 'platform_owner', 'platform_admin'])
      .eq('is_active', true);
    
    const isPlatformAdmin = (platformRoles || []).length > 0;
    const platformAdminPlatformIds = (platformRoles || []).map(r => r.city_platform_id);
    
    if (!isSuperAdmin && !isPlatformAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Fetch prayers
    let prayersQuery = adminClient
      .from('prayers')
      .select(`
        *,
        church:churches(id, name, city, state)
      `)
      .order('created_at', { ascending: false });

    if (status) {
      if (status === 'answered') {
        // Special filter for answered prayers
        prayersQuery = prayersQuery.not('answered_at', 'is', null);
      } else {
        prayersQuery = prayersQuery.eq('status', status);
      }
    }
    
    // City platform filtering
    // Super admins can see all or filter by platform
    // Platform admins can only see prayers for their platforms
    if (isSuperAdmin && cityPlatformId) {
      prayersQuery = prayersQuery.eq('city_platform_id', cityPlatformId);
    } else if (!isSuperAdmin && isPlatformAdmin) {
      // Platform admins see only their platforms' prayers
      if (platformAdminPlatformIds.length === 1) {
        prayersQuery = prayersQuery.eq('city_platform_id', platformAdminPlatformIds[0]);
      } else if (platformAdminPlatformIds.length > 1) {
        prayersQuery = prayersQuery.in('city_platform_id', platformAdminPlatformIds);
      }
    }

    const { data: prayers, error: prayersError } = await prayersQuery;

    if (prayersError) {
      console.error('Error fetching prayers:', prayersError);
      return res.status(500).json({ error: 'Failed to fetch prayers' });
    }

    return res.status(200).json(prayers);

  } catch (error) {
    console.error('Error in admin prayers:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
