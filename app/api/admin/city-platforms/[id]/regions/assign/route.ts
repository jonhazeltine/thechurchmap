import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../../lib/supabaseServer";
import { assignBoundariesToRegionSchema } from "@shared/schema";

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

    const resolvedPlatform = await resolvePlatformId(adminClient, platformIdOrSlug);
    if (!resolvedPlatform) {
      return res.status(404).json({ error: 'Platform not found' });
    }
    const platformId = resolvedPlatform.id;

    const { hasAccess } = await checkPlatformAccess(
      adminClient,
      user.id,
      platformId,
      user.user_metadata
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this platform' });
    }

    const parseResult = assignBoundariesToRegionSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { region_id, boundary_ids } = parseResult.data;

    const { data: existingRegion, error: regionError } = await adminClient
      .from('platform_regions')
      .select('id')
      .eq('id', region_id)
      .eq('city_platform_id', platformId)
      .single();

    if (regionError || !existingRegion) {
      return res.status(404).json({ error: 'Region not found in this platform' });
    }

    // Region boundaries are independent - no longer auto-adding to platform boundaries
    const { error: deleteError } = await adminClient
      .from('region_boundaries')
      .delete()
      .eq('region_id', region_id);

    if (deleteError) {
      console.error('Error clearing existing region boundaries:', deleteError);
      return res.status(500).json({ error: 'Failed to update region boundaries' });
    }

    if (boundary_ids.length > 0) {
      const insertData = boundary_ids.map(boundary_id => ({
        region_id,
        boundary_id,
      }));

      const { error: insertError } = await adminClient
        .from('region_boundaries')
        .insert(insertData);

      if (insertError) {
        console.error('Error inserting region boundaries:', insertError);
        return res.status(500).json({ error: 'Failed to assign boundaries to region' });
      }
    }

    const { data: updatedBoundaries, error: fetchError } = await adminClient
      .from('region_boundaries')
      .select(`
        id,
        region_id,
        boundary_id,
        added_at
      `)
      .eq('region_id', region_id);

    if (fetchError) {
      console.error('Error fetching updated boundaries:', fetchError);
    }

    return res.status(200).json({
      success: true,
      region_id,
      boundary_count: boundary_ids.length,
      region_boundaries: updatedBoundaries || [],
    });

  } catch (error) {
    console.error('Error in POST /api/admin/city-platforms/:id/regions/assign:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
