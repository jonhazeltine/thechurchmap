import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

async function resolvePlatformId(
  client: ReturnType<typeof supabaseServer>,
  idOrSlug: string
): Promise<{ id: string; name: string } | null> {
  if (isValidUUID(idOrSlug)) {
    const { data } = await client
      .from('city_platforms')
      .select('id, name')
      .eq('id', idOrSlug)
      .single();
    return data;
  }
  
  const { data } = await client
    .from('city_platforms')
    .select('id, name')
    .eq('slug', idOrSlug)
    .single();
  return data;
}

async function checkPlatformAccess(
  adminClient: ReturnType<typeof supabaseServer>,
  userId: string,
  platformId: string,
  userMetadata: any
): Promise<{ hasAccess: boolean; isSuperAdmin: boolean }> {
  const isSuperAdmin = userMetadata?.super_admin === true;
  
  if (isSuperAdmin) {
    return { hasAccess: true, isSuperAdmin: true };
  }

  const { data: userRole } = await adminClient
    .from('city_platform_users')
    .select('role')
    .eq('city_platform_id', platformId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('role', ['platform_owner', 'platform_admin'])
    .single();

  return { hasAccess: !!userRole, isSuperAdmin: false };
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

    const { id: platformIdOrSlug } = req.params;

    const platform = await resolvePlatformId(adminClient, platformIdOrSlug);
    if (!platform) {
      return res.status(404).json({ error: 'Platform not found' });
    }
    const platformId = platform.id;

    const { hasAccess } = await checkPlatformAccess(
      adminClient,
      user.id,
      platformId,
      user.user_metadata
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this platform' });
    }

    const [
      boundariesResult,
      churchesResult,
      importJobsResult,
      duplicatesResult
    ] = await Promise.all([
      adminClient
        .from('city_platform_boundaries')
        .select('id', { count: 'exact', head: true })
        .eq('city_platform_id', platformId),
      
      adminClient
        .from('city_platform_churches')
        .select(`
          id,
          status,
          churches:church_id (
            id,
            verification_status
          )
        `)
        .eq('city_platform_id', platformId),
      
      adminClient
        .from('import_jobs')
        .select('id, status')
        .eq('city_platform_id', platformId)
        .eq('status', 'completed')
        .limit(1),
      
      adminClient.rpc('fn_find_duplicate_clusters', {
        p_platform_id: platformId,
        p_distance_threshold: 100
      })
    ]);

    const boundariesCount = boundariesResult.count ?? 0;
    const churches = churchesResult.data ?? [];
    const hasCompletedImport = (importJobsResult.data?.length ?? 0) > 0;
    const duplicateClusters = duplicatesResult.data ?? [];

    const totalChurches = churches.filter(c => c.status === 'visible' || c.status === 'featured').length;
    const outsideBoundsCount = churches.filter(c => c.status === 'hidden').length;
    
    const needsReviewCount = churches.filter(c => {
      const church = c.churches as any;
      return church?.verification_status === 'needs_review' && 
             (c.status === 'visible' || c.status === 'featured' || c.status === 'pending');
    }).length;

    const notVerifiedYetCount = churches.filter(c => {
      const church = c.churches as any;
      return !church?.verification_status && 
             (c.status === 'visible' || c.status === 'featured' || c.status === 'pending');
    }).length;

    const unreviewedClusters = duplicateClusters.filter((cluster: any) => !cluster.reviewed);

    return res.json({
      boundariesCount,
      totalChurches,
      outsideBoundsCount,
      duplicateClusters: unreviewedClusters.length,
      needsReviewCount,
      notVerifiedYetCount,
      hasCompletedImport: hasCompletedImport || totalChurches > 0,
    });
  } catch (error) {
    console.error('Error fetching setup status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
