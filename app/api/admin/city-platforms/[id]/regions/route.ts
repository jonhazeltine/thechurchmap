import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";
import { z } from "zod";
import {
  insertPlatformRegionSchema,
  updatePlatformRegionSchema,
  REGION_COLORS,
} from "@shared/schema";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolvePlatformId(
  supabase: ReturnType<typeof supabaseServer>,
  platformIdOrSlug: string
): Promise<{ id: string; name: string; is_public: boolean } | null> {
  if (UUID_REGEX.test(platformIdOrSlug)) {
    const { data } = await supabase
      .from('city_platforms')
      .select('id, name, is_public')
      .eq('id', platformIdOrSlug)
      .single();
    return data;
  }
  
  const { data } = await supabase
    .from('city_platforms')
    .select('id, name, is_public')
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

export async function GET(req: Request, res: Response) {
  try {
    const adminClient = supabaseServer();
    const { id: platformIdOrSlug } = req.params;

    const resolvedPlatform = await resolvePlatformId(adminClient, platformIdOrSlug);
    if (!resolvedPlatform) {
      return res.status(404).json({ error: 'Platform not found' });
    }
    const platformId = resolvedPlatform.id;

    const authHeader = req.headers.authorization;
    let hasAccess = false;

    if (resolvedPlatform.is_public) {
      hasAccess = true;
    } else {
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

      if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const accessResult = await checkPlatformAccess(
        adminClient,
        user.id,
        platformId,
        user.user_metadata
      );
      hasAccess = accessResult.hasAccess;
    }

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this platform' });
    }

    const { data: regionsWithCounts, error: rpcError } = await adminClient.rpc(
      'fn_get_platform_regions_with_counts',
      { p_platform_id: platformId }
    );

    if (rpcError) {
      console.error('Error fetching regions with counts:', rpcError);
      return res.status(500).json({ error: 'Failed to fetch regions' });
    }

    const regionIds = (regionsWithCounts || []).map((r: any) => r.id);
    let regionBoundaries: any[] = [];
    
    console.log('🗺️ DEBUG Regions - Platform:', platformId);
    console.log('🗺️ DEBUG Regions - Region count:', regionsWithCounts?.length || 0);
    console.log('🗺️ DEBUG Regions - Region IDs:', regionIds);

    if (regionIds.length > 0) {
      const { data: boundaries, error: boundariesError } = await adminClient
        .from('region_boundaries')
        .select(`
          id,
          region_id,
          boundary_id,
          added_at
        `)
        .in('region_id', regionIds);

      if (boundariesError) {
        console.error('Error fetching region boundaries:', boundariesError);
      } else {
        regionBoundaries = boundaries || [];
        console.log('🗺️ DEBUG Regions - Region boundaries fetched:', regionBoundaries.length);
        console.log('🗺️ DEBUG Regions - First few boundaries:', JSON.stringify(regionBoundaries.slice(0, 5)));
      }
    }

    const boundariesByRegion = regionBoundaries.reduce((acc: Record<string, any[]>, rb) => {
      if (!acc[rb.region_id]) {
        acc[rb.region_id] = [];
      }
      acc[rb.region_id].push(rb);
      return acc;
    }, {});

    const regionsWithBoundaries = (regionsWithCounts || []).map((region: any) => {
      const regionBoundaryList = boundariesByRegion[region.id] || [];
      return {
        ...region,
        region_boundaries: regionBoundaryList,
        // Include boundary_ids as an array of string IDs for the frontend to use
        boundary_ids: regionBoundaryList.map((rb: any) => rb.boundary_id),
      };
    });

    return res.status(200).json({
      regions: regionsWithBoundaries,
    });

  } catch (error) {
    console.error('Error in GET /api/admin/city-platforms/:id/regions:', error);
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

    const bodyWithPlatformId = {
      ...req.body,
      city_platform_id: platformId,
    };

    if (!bodyWithPlatformId.color) {
      const { count } = await adminClient
        .from('platform_regions')
        .select('id', { count: 'exact', head: true })
        .eq('city_platform_id', platformId);

      const colorIndex = (count || 0) % REGION_COLORS.length;
      bodyWithPlatformId.color = REGION_COLORS[colorIndex];
    }

    const parseResult = insertPlatformRegionSchema.safeParse(bodyWithPlatformId);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { count: maxSortOrder } = await adminClient
      .from('platform_regions')
      .select('sort_order', { count: 'exact', head: true })
      .eq('city_platform_id', platformId);

    const insertData = {
      ...parseResult.data,
      sort_order: parseResult.data.sort_order || (maxSortOrder || 0),
      created_by_user_id: user.id,
    };

    const { data: newRegion, error: insertError } = await adminClient
      .from('platform_regions')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return res.status(409).json({ error: 'A region with this name already exists in this platform' });
      }
      console.error('Error creating region:', insertError);
      return res.status(500).json({ error: 'Failed to create region' });
    }

    return res.status(201).json(newRegion);

  } catch (error) {
    console.error('Error in POST /api/admin/city-platforms/:id/regions:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

const updateRegionRequestSchema = z.object({
  region_id: z.string().uuid(),
}).merge(updatePlatformRegionSchema);

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

    const parseResult = updateRegionRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { region_id, ...updateData } = parseResult.data;

    const { data: existingRegion, error: regionError } = await adminClient
      .from('platform_regions')
      .select('id')
      .eq('id', region_id)
      .eq('city_platform_id', platformId)
      .single();

    if (regionError || !existingRegion) {
      return res.status(404).json({ error: 'Region not found in this platform' });
    }

    const hasUpdates = Object.keys(updateData).length > 0;
    if (!hasUpdates) {
      return res.status(400).json({ error: 'No update fields provided' });
    }

    const { data: updatedRegion, error: updateError } = await adminClient
      .from('platform_regions')
      .update(updateData)
      .eq('id', region_id)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === '23505') {
        return res.status(409).json({ error: 'A region with this name already exists in this platform' });
      }
      console.error('Error updating region:', updateError);
      return res.status(500).json({ error: 'Failed to update region' });
    }

    return res.status(200).json(updatedRegion);

  } catch (error) {
    console.error('Error in PATCH /api/admin/city-platforms/:id/regions:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

const deleteRegionSchema = z.object({
  region_id: z.string().uuid(),
});

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

    const parseResult = deleteRegionSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { region_id } = parseResult.data;

    const { data: existingRegion, error: regionError } = await adminClient
      .from('platform_regions')
      .select('id')
      .eq('id', region_id)
      .eq('city_platform_id', platformId)
      .single();

    if (regionError || !existingRegion) {
      return res.status(404).json({ error: 'Region not found in this platform' });
    }

    const { error: deleteError } = await adminClient
      .from('platform_regions')
      .delete()
      .eq('id', region_id);

    if (deleteError) {
      console.error('Error deleting region:', deleteError);
      return res.status(500).json({ error: 'Failed to delete region' });
    }

    return res.status(200).json({ success: true, deleted: region_id });

  } catch (error) {
    console.error('Error in DELETE /api/admin/city-platforms/:id/regions:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
