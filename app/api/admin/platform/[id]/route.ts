import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";

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

    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const { id: platformId } = req.params;

    const { data: platform, error: platformError } = await adminClient
      .from('city_platforms')
      .select(`
        id,
        name,
        slug,
        description,
        is_active,
        is_public
      `)
      .eq('id', platformId)
      .single();

    if (platformError) {
      if (platformError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Platform not found' });
      }
      console.error('Error fetching platform:', platformError);
      return res.status(500).json({ error: 'Failed to fetch platform' });
    }

    const { count: memberCount } = await adminClient
      .from('city_platform_users')
      .select('id', { count: 'exact', head: true })
      .eq('city_platform_id', platformId);

    const { count: churchCount } = await adminClient
      .from('city_platform_churches')
      .select('id', { count: 'exact', head: true })
      .eq('city_platform_id', platformId);

    const { count: boundaryCount } = await adminClient
      .from('city_platform_boundaries')
      .select('id', { count: 'exact', head: true })
      .eq('city_platform_id', platformId);

    const { count: membershipRequestCount } = await adminClient
      .from('platform_membership_requests')
      .select('id', { count: 'exact', head: true })
      .eq('platform_id', platformId);

    const { count: applicationCount } = await adminClient
      .from('city_platform_applications')
      .select('id', { count: 'exact', head: true })
      .eq('created_platform_id', platformId);

    return res.status(200).json({
      ...platform,
      member_count: memberCount || 0,
      church_count: churchCount || 0,
      boundary_count: boundaryCount || 0,
      membership_request_count: membershipRequestCount || 0,
      application_count: applicationCount || 0,
    });

  } catch (error) {
    console.error('Error in GET /api/admin/platform/:id:', error);
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

    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Only super admins can delete platforms' });
    }

    const { id: platformId } = req.params;

    const { data: platform, error: fetchError } = await adminClient
      .from('city_platforms')
      .select('id, name')
      .eq('id', platformId)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Platform not found' });
      }
      console.error('Error fetching platform:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch platform' });
    }

    const deletedCounts: Record<string, number> = {};

    const { count: usersDeleted, error: usersError } = await adminClient
      .from('city_platform_users')
      .delete()
      .eq('city_platform_id', platformId)
      .select('id', { count: 'exact', head: true });

    if (usersError) {
      console.error('Error deleting platform users:', usersError);
      return res.status(500).json({ error: 'Failed to delete platform users' });
    }
    deletedCounts.users = usersDeleted || 0;

    const { count: boundariesDeleted, error: boundariesError } = await adminClient
      .from('city_platform_boundaries')
      .delete()
      .eq('city_platform_id', platformId)
      .select('id', { count: 'exact', head: true });

    if (boundariesError) {
      console.error('Error deleting platform boundaries:', boundariesError);
      return res.status(500).json({ error: 'Failed to delete platform boundaries' });
    }
    deletedCounts.boundaries = boundariesDeleted || 0;

    const { count: churchesDeleted, error: churchesError } = await adminClient
      .from('city_platform_churches')
      .delete()
      .eq('city_platform_id', platformId)
      .select('id', { count: 'exact', head: true });

    if (churchesError) {
      console.error('Error deleting platform churches:', churchesError);
      return res.status(500).json({ error: 'Failed to delete platform churches' });
    }
    deletedCounts.churches = churchesDeleted || 0;

    const { count: requestsDeleted, error: requestsError } = await adminClient
      .from('platform_membership_requests')
      .delete()
      .eq('platform_id', platformId)
      .select('id', { count: 'exact', head: true });

    if (requestsError) {
      console.error('Error deleting membership requests:', requestsError);
      return res.status(500).json({ error: 'Failed to delete membership requests' });
    }
    deletedCounts.membership_requests = requestsDeleted || 0;

    const { count: applicationsUpdated, error: applicationsError } = await adminClient
      .from('city_platform_applications')
      .update({ created_platform_id: null })
      .eq('created_platform_id', platformId)
      .select('id', { count: 'exact', head: true });

    if (applicationsError) {
      console.error('Error unlinking platform applications:', applicationsError);
      return res.status(500).json({ error: 'Failed to unlink platform applications' });
    }
    deletedCounts.applications_unlinked = applicationsUpdated || 0;

    const { error: platformDeleteError } = await adminClient
      .from('city_platforms')
      .delete()
      .eq('id', platformId);

    if (platformDeleteError) {
      console.error('Error deleting platform:', platformDeleteError);
      return res.status(500).json({ error: 'Failed to delete platform' });
    }

    console.log(`Platform ${platform.name} (${platformId}) deleted by super admin ${user.id}`, deletedCounts);

    return res.status(200).json({
      success: true,
      message: `Platform "${platform.name}" has been permanently deleted`,
      deleted: deletedCounts,
    });

  } catch (error) {
    console.error('Error in DELETE /api/admin/platform/:id:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
