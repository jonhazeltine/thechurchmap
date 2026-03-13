import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";
import * as wkx from 'wkx';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolvePlatformId(
  supabase: ReturnType<typeof supabaseServer>,
  platformIdOrSlug: string
): Promise<{ id: string; name: string } | null> {
  if (UUID_REGEX.test(platformIdOrSlug)) {
    const { data } = await supabase
      .from('city_platforms')
      .select('id, name')
      .eq('id', platformIdOrSlug)
      .single();
    return data;
  }
  
  const { data } = await supabase
    .from('city_platforms')
    .select('id, name')
    .eq('slug', platformIdOrSlug)
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

function parseLocationToCoords(location: any): { lat: number; lng: number } | null {
  if (!location) return null;
  
  const locStr = typeof location === 'string' ? location : String(location);
  
  // Handle WKT format: POINT(lng lat)
  const wktMatch = locStr.match(/POINT\(([^ ]+) ([^)]+)\)/);
  if (wktMatch) {
    return {
      lng: parseFloat(wktMatch[1]),
      lat: parseFloat(wktMatch[2]),
    };
  }
  
  // Handle WKB hex format (PostGIS default): 0101000020E6100000...
  if (/^[0-9A-Fa-f]+$/.test(locStr) && locStr.length >= 34) {
    try {
      const buffer = Buffer.from(locStr, 'hex');
      const geom = wkx.Geometry.parse(buffer) as any;
      if (geom && typeof geom.x === 'number' && typeof geom.y === 'number') {
        return {
          lng: geom.x,
          lat: geom.y,
        };
      }
    } catch (e: any) {
      console.warn('[parseLocationToCoords] WKB parse error:', e.message);
    }
  }
  
  return null;
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

    const { id: platformIdOrSlug } = req.params;
    const { action } = req.body;

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

    if (action === 'hide-out-of-bounds') {
      return await hideOutOfBoundsChurches(adminClient, platformId, platform.name, res);
    } else if (action === 'unhide-all') {
      return await unhideAllChurches(adminClient, platformId, platform.name, res);
    } else if (action === 'review-hidden-in-bounds') {
      return await reviewHiddenInBoundsChurches(adminClient, platformId, platform.name, res);
    } else {
      return res.status(400).json({ 
        error: 'Invalid action',
        validActions: ['hide-out-of-bounds', 'unhide-all', 'review-hidden-in-bounds']
      });
    }

  } catch (error: any) {
    console.error('Error in POST /api/admin/city-platforms/:id/boundary-cleanup:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

async function hideOutOfBoundsChurches(
  adminClient: ReturnType<typeof supabaseServer>,
  platformId: string,
  platformName: string,
  res: Response
) {
  console.log(`[Boundary Cleanup] Hiding out-of-bounds churches for platform: ${platformName}`);

  const { data: platformBoundaries, error: boundaryError } = await adminClient
    .from('city_platform_boundaries')
    .select('boundary_id')
    .eq('city_platform_id', platformId);

  if (boundaryError || !platformBoundaries?.length) {
    return res.status(400).json({ error: 'Platform has no boundaries defined' });
  }

  const platformBoundaryIds = platformBoundaries.map(pb => pb.boundary_id);

  const { data: platformChurches, error: churchError } = await adminClient
    .from('city_platform_churches')
    .select(`
      id,
      church_id,
      status,
      churches:church_id (
        id,
        name,
        location
      )
    `)
    .eq('city_platform_id', platformId)
    .neq('status', 'hidden');

  if (churchError) {
    console.error('Error fetching platform churches:', churchError);
    return res.status(500).json({ error: 'Failed to fetch churches' });
  }

  let hiddenCount = 0;
  let inBoundsCount = 0;
  const hiddenChurches: string[] = [];

  let skippedCount = 0;
  let debuggedFirst = false;
  for (const pc of platformChurches || []) {
    const church = pc.churches as any;
    if (!church?.location) {
      skippedCount++;
      continue;
    }

    // Debug first church location
    if (!debuggedFirst) {
      console.log('[Boundary Cleanup] First church location debug:', {
        name: church.name,
        locationType: typeof church.location,
        locationValue: church.location,
        locationKeys: typeof church.location === 'object' ? Object.keys(church.location) : null
      });
      debuggedFirst = true;
    }

    const coords = parseLocationToCoords(church.location);
    if (!coords) {
      skippedCount++;
      continue;
    }

    try {
      const { data: containingBoundaries, error: rpcError } = await adminClient.rpc(
        'fn_get_boundaries_for_church',
        { church_lat: coords.lat, church_lon: coords.lng }
      );

      if (rpcError) {
        console.warn(`[Boundary Cleanup] RPC error for "${church.name}": ${rpcError.message}`);
        skippedCount++;
        continue;
      }

      const containingBoundaryIds = (containingBoundaries || []).map((b: any) => b.id);
      const isInPlatformBoundary = platformBoundaryIds.some(pbId => 
        containingBoundaryIds.includes(pbId)
      );

      if (!isInPlatformBoundary) {
        await adminClient
          .from('city_platform_churches')
          .update({ 
            status: 'hidden',
            updated_at: new Date().toISOString()
          })
          .eq('id', pc.id);
        
        hiddenCount++;
        hiddenChurches.push(church.name);
      } else {
        inBoundsCount++;
      }
    } catch (error: any) {
      console.error(`[Boundary Cleanup] Error checking "${church.name}": ${error.message}`);
      skippedCount++;
    }
  }

  console.log(`[Boundary Cleanup] Complete: ${hiddenCount} hidden, ${inBoundsCount} in bounds, ${skippedCount} skipped`);

  return res.status(200).json({
    success: true,
    summary: {
      totalChecked: (platformChurches || []).length,
      hiddenOutOfBounds: hiddenCount,
      remainingInBounds: inBoundsCount,
      skipped: skippedCount,
    },
    message: `Hidden ${hiddenCount} churches outside boundaries. ${inBoundsCount} remain visible.${skippedCount > 0 ? ` ${skippedCount} skipped due to missing data or errors.` : ''}`,
    hiddenChurches: hiddenChurches.slice(0, 20),
  });
}

async function unhideAllChurches(
  adminClient: ReturnType<typeof supabaseServer>,
  platformId: string,
  platformName: string,
  res: Response
) {
  console.log(`[Boundary Cleanup] Unhiding all hidden churches for platform: ${platformName}`);

  const { data: hiddenChurches, error: fetchError } = await adminClient
    .from('city_platform_churches')
    .select('id, church_id, churches:church_id(name)')
    .eq('city_platform_id', platformId)
    .eq('status', 'hidden');

  if (fetchError) {
    console.error('Error fetching hidden churches:', fetchError);
    return res.status(500).json({ error: 'Failed to fetch hidden churches' });
  }

  const count = hiddenChurches?.length || 0;

  if (count === 0) {
    return res.status(200).json({
      success: true,
      summary: { unhidden: 0 },
      message: 'No hidden churches found to unhide.',
    });
  }

  const { error: updateError } = await adminClient
    .from('city_platform_churches')
    .update({ 
      status: 'pending',
      updated_at: new Date().toISOString()
    })
    .eq('city_platform_id', platformId)
    .eq('status', 'hidden');

  if (updateError) {
    console.error('Error unhiding churches:', updateError);
    return res.status(500).json({ error: 'Failed to unhide churches' });
  }

  const churchNames = hiddenChurches?.map((hc: any) => hc.churches?.name).filter(Boolean) || [];

  console.log(`[Boundary Cleanup] Unhid ${count} churches for platform ${platformName}`);

  return res.status(200).json({
    success: true,
    summary: { unhidden: count },
    message: `Successfully unhid ${count} churches. They are now in 'pending' status for review.`,
    unhiddenChurches: churchNames.slice(0, 20),
  });
}

async function reviewHiddenInBoundsChurches(
  adminClient: ReturnType<typeof supabaseServer>,
  platformId: string,
  platformName: string,
  res: Response
) {
  console.log(`[Boundary Cleanup] Reviewing hidden churches that are now in bounds for platform: ${platformName}`);

  const { data: platformBoundaries, error: boundaryError } = await adminClient
    .from('city_platform_boundaries')
    .select('boundary_id')
    .eq('city_platform_id', platformId);

  if (boundaryError || !platformBoundaries?.length) {
    return res.status(400).json({ error: 'Platform has no boundaries defined' });
  }

  const platformBoundaryIds = platformBoundaries.map(pb => pb.boundary_id);

  const { data: hiddenChurches, error: churchError } = await adminClient
    .from('city_platform_churches')
    .select(`
      id,
      church_id,
      churches:church_id (
        id,
        name,
        location
      )
    `)
    .eq('city_platform_id', platformId)
    .eq('status', 'hidden');

  if (churchError) {
    console.error('Error fetching hidden churches:', churchError);
    return res.status(500).json({ error: 'Failed to fetch hidden churches' });
  }

  let movedToPendingCount = 0;
  let stillOutOfBoundsCount = 0;
  let skippedCount = 0;
  const movedChurches: string[] = [];

  for (const hc of hiddenChurches || []) {
    const church = hc.churches as any;
    if (!church?.location) {
      skippedCount++;
      continue;
    }

    const coords = parseLocationToCoords(church.location.toString());
    if (!coords) {
      skippedCount++;
      continue;
    }

    try {
      const { data: containingBoundaries, error: rpcError } = await adminClient.rpc(
        'fn_get_boundaries_for_church',
        { church_lat: coords.lat, church_lon: coords.lng }
      );

      if (rpcError) {
        console.warn(`[Boundary Cleanup] RPC error for "${church.name}": ${rpcError.message}`);
        skippedCount++;
        continue;
      }

      const containingBoundaryIds = (containingBoundaries || []).map((b: any) => b.id);
      const isInPlatformBoundary = platformBoundaryIds.some(pbId => 
        containingBoundaryIds.includes(pbId)
      );

      if (isInPlatformBoundary) {
        await adminClient
          .from('city_platform_churches')
          .update({ 
            status: 'pending',
            updated_at: new Date().toISOString()
          })
          .eq('id', hc.id);
        
        movedToPendingCount++;
        movedChurches.push(church.name);
      } else {
        stillOutOfBoundsCount++;
      }
    } catch (error: any) {
      console.error(`[Boundary Cleanup] Error checking "${church.name}": ${error.message}`);
      skippedCount++;
    }
  }

  console.log(`[Boundary Cleanup] Re-review complete: ${movedToPendingCount} moved to pending, ${stillOutOfBoundsCount} still hidden, ${skippedCount} skipped`);

  return res.status(200).json({
    success: true,
    summary: {
      totalHiddenChecked: (hiddenChurches || []).length,
      movedToPending: movedToPendingCount,
      stillHidden: stillOutOfBoundsCount,
      skipped: skippedCount,
    },
    message: `${movedToPendingCount} hidden churches are now in-bounds and moved to 'pending' for review. ${stillOutOfBoundsCount} remain hidden.${skippedCount > 0 ? ` ${skippedCount} skipped due to missing data or errors.` : ''}`,
    movedChurches: movedChurches.slice(0, 20),
  });
}
