import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";
import { z } from "zod";

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

const addBoundarySchema = z.object({
  boundary_id: z.string().uuid(),
  role: z.enum(['primary', 'included', 'excluded']).default('included'),
});

const updateBoundarySchema = z.object({
  boundary_id: z.string().uuid(),
  role: z.enum(['primary', 'included', 'excluded']).optional(),
  remove: z.boolean().optional(),
});

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

    // Resolve slug to ID if needed
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

    const { data: platform, error: platformError } = await adminClient
      .from('city_platforms')
      .select('id, name, default_center_lat, default_center_lng, default_zoom')
      .eq('id', platformId)
      .single();

    if (platformError) {
      if (platformError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Platform not found' });
      }
      console.error('Error fetching platform:', platformError);
      return res.status(500).json({ error: 'Failed to fetch platform' });
    }

    const { data: boundaries, error: boundariesError } = await adminClient
      .from('city_platform_boundaries')
      .select(`
        id,
        role,
        sort_order,
        added_at,
        boundary:boundaries(
          id,
          name,
          type,
          external_id
        )
      `)
      .eq('city_platform_id', platformId)
      .order('sort_order', { ascending: true });

    if (boundariesError) {
      console.error('Error fetching boundaries:', boundariesError);
      return res.status(500).json({ error: 'Failed to fetch boundaries' });
    }

    const boundaryIds = (boundaries || [])
      .map(b => (b.boundary as any)?.id)
      .filter(Boolean);

    console.log('🗺️ DEBUG Boundaries API - Platform:', platformId);
    console.log('🗺️ DEBUG Boundaries count:', boundaries?.length || 0);
    console.log('🗺️ DEBUG Boundary IDs to fetch geometry:', boundaryIds.length);
    console.log('🗺️ DEBUG ALL boundary IDs:', JSON.stringify(boundaryIds));
    if (boundaries?.length) {
      console.log('🗺️ DEBUG First boundary:', JSON.stringify(boundaries[0]?.boundary));
    }

    let geometries: any[] = [];
    if (boundaryIds.length > 0) {
      // Use fn_get_boundaries_with_geometry with JSON-stringified IDs
      // This avoids the UUID/text type mismatch issue
      const { data: geoData, error: geoError } = await adminClient.rpc(
        'fn_get_boundaries_with_geometry',
        { ids_json: JSON.stringify(boundaryIds) }
      );

      if (geoError) {
        console.error('Error fetching boundaries by IDs via RPC:', geoError);
      }
      if (!geoError && geoData) {
        geometries = geoData;
        console.log('🗺️ DEBUG Geometries returned from RPC:', geometries.length);
        if (geometries.length > 0) {
          console.log('🗺️ DEBUG First geometry sample:', {
            id: geometries[0]?.id,
            name: geometries[0]?.name,
            hasGeometry: !!geometries[0]?.geometry,
            geometryType: typeof geometries[0]?.geometry,
          });
        }
      }
    }

    // Parse geometry if it's a string (RPC may return text instead of JSON)
    const geometryMap = new Map(geometries.map(g => {
      let geometry = g.geometry;
      if (typeof geometry === 'string') {
        try {
          geometry = JSON.parse(geometry);
        } catch (e) {
          console.error('Failed to parse geometry JSON:', e);
          geometry = null;
        }
      }
      return [g.id, geometry];
    }));

    const boundariesWithGeometry = (boundaries || []).map(b => {
      const boundaryInfo = b.boundary as any;
      return {
        ...b,
        boundary: boundaryInfo ? {
          ...boundaryInfo,
          geometry: geometryMap.get(boundaryInfo.id) || null,
        } : null,
      };
    });

    // Debug: Check final result
    const withGeo = boundariesWithGeometry.filter(b => b.boundary?.geometry);
    console.log('🗺️ DEBUG Final boundaries with geometry:', withGeo.length, 'out of', boundariesWithGeometry.length);

    return res.status(200).json({
      platform,
      boundaries: boundariesWithGeometry,
    });

  } catch (error) {
    console.error('Error in GET /api/admin/city-platforms/:id/boundaries:', error);
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

    // Resolve slug to UUID if needed
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

    const parseResult = addBoundarySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { boundary_id, role } = parseResult.data;

    const { data: existingLink } = await adminClient
      .from('city_platform_boundaries')
      .select('id')
      .eq('city_platform_id', platformId)
      .eq('boundary_id', boundary_id)
      .single();

    if (existingLink) {
      return res.status(409).json({ error: 'This boundary is already added to the platform' });
    }

    const { data: boundary, error: boundaryError } = await adminClient
      .from('boundaries')
      .select('id, name, type')
      .eq('id', boundary_id)
      .single();

    if (boundaryError || !boundary) {
      return res.status(404).json({ error: 'Boundary not found' });
    }

    const { count } = await adminClient
      .from('city_platform_boundaries')
      .select('id', { count: 'exact', head: true })
      .eq('city_platform_id', platformId);

    const sortOrder = (count || 0) + 1;

    const { data: newLink, error: insertError } = await adminClient
      .from('city_platform_boundaries')
      .insert({
        city_platform_id: platformId,
        boundary_id,
        role,
        sort_order: sortOrder,
        added_by_user_id: user.id,
      })
      .select(`
        id,
        role,
        sort_order,
        added_at,
        boundary:boundaries(id, name, type, external_id)
      `)
      .single();

    if (insertError) {
      console.error('Error adding boundary:', insertError);
      return res.status(500).json({ error: 'Failed to add boundary' });
    }

    if (role === 'primary') {
      await adminClient
        .from('city_platforms')
        .update({ primary_boundary_id: boundary_id })
        .eq('id', platformId);
    }

    // Auto-link churches within the newly added boundary
    try {
      const { data: churchesInBoundary, error: churchError } = await adminClient.rpc(
        'fn_churches_within_boundaries',
        { p_boundary_ids: [boundary_id] }
      );

      if (churchError) {
        console.error('Error finding churches in boundary:', churchError);
      } else if (churchesInBoundary && churchesInBoundary.length > 0) {
        console.log(`Found ${churchesInBoundary.length} churches within new boundary`);

        // Insert church links (ignore duplicates, city_platform_churches doesn't have added_by_user_id)
        const churchLinks = churchesInBoundary.map((church: { church_id: string }) => ({
          city_platform_id: platformId,
          church_id: church.church_id,
          status: 'visible',
        }));

        const { error: linkError } = await adminClient
          .from('city_platform_churches')
          .upsert(churchLinks, { 
            onConflict: 'city_platform_id,church_id',
            ignoreDuplicates: true 
          });

        if (linkError) {
          console.error('Error linking churches to platform:', linkError);
        } else {
          console.log(`Successfully linked ${churchLinks.length} churches to platform`);
          // Mark all linked churches as managed by platform for tileset filtering
          const churchIds = churchesInBoundary.map((c: { church_id: string }) => c.church_id);
          await adminClient
            .from('churches')
            .update({ managed_by_platform: true })
            .in('id', churchIds);
        }
      }
    } catch (linkErr) {
      console.error('Error in church auto-linking:', linkErr);
    }

    return res.status(201).json(newLink);

  } catch (error) {
    console.error('Error in POST /api/admin/city-platforms/:id/boundaries:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
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

    const { id: platformIdOrSlug } = req.params;

    // Resolve slug to UUID if needed
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

    const parseResult = updateBoundarySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { boundary_id, role, remove } = parseResult.data;

    const { data: existingLink, error: linkError } = await adminClient
      .from('city_platform_boundaries')
      .select('id, role')
      .eq('city_platform_id', platformId)
      .eq('boundary_id', boundary_id)
      .single();

    if (linkError || !existingLink) {
      return res.status(404).json({ error: 'Boundary not found in this platform' });
    }

    if (remove) {
      const { error: deleteError } = await adminClient
        .from('city_platform_boundaries')
        .delete()
        .eq('id', existingLink.id);

      if (deleteError) {
        console.error('Error removing boundary:', deleteError);
        return res.status(500).json({ error: 'Failed to remove boundary' });
      }

      if (existingLink.role === 'primary') {
        await adminClient
          .from('city_platforms')
          .update({ primary_boundary_id: null })
          .eq('id', platformId);
      }

      // Resync church links after boundary removal
      // Get remaining boundary IDs
      try {
        const { data: remainingBoundaries } = await adminClient
          .from('city_platform_boundaries')
          .select('boundary_id')
          .eq('city_platform_id', platformId);

        const remainingBoundaryIds = (remainingBoundaries || []).map(b => b.boundary_id);

        if (remainingBoundaryIds.length > 0) {
          // Find churches within remaining boundaries
          const { data: validChurches, error: churchError } = await adminClient.rpc(
            'fn_churches_within_boundaries',
            { p_boundary_ids: remainingBoundaryIds }
          );

          if (!churchError && validChurches) {
            const validChurchIds = new Set(validChurches.map((c: { church_id: string }) => c.church_id));

            // Get current church links
            const { data: currentLinks } = await adminClient
              .from('city_platform_churches')
              .select('church_id')
              .eq('city_platform_id', platformId);

            // Find churches to remove (those not in any remaining boundary)
            const churchIdsToRemove = (currentLinks || [])
              .filter(link => !validChurchIds.has(link.church_id))
              .map(link => link.church_id);

            if (churchIdsToRemove.length > 0) {
              const { error: unlinkError } = await adminClient
                .from('city_platform_churches')
                .delete()
                .eq('city_platform_id', platformId)
                .in('church_id', churchIdsToRemove);

              if (unlinkError) {
                console.error('Error unlinking churches:', unlinkError);
              } else {
                console.log(`Removed ${churchIdsToRemove.length} churches no longer in platform boundaries`);
              }
            }
          }
        } else {
          // No boundaries left, remove all church links
          const { error: clearError } = await adminClient
            .from('city_platform_churches')
            .delete()
            .eq('city_platform_id', platformId);

          if (clearError) {
            console.error('Error clearing church links:', clearError);
          } else {
            console.log('Cleared all church links as no boundaries remain');
          }
        }
      } catch (syncErr) {
        console.error('Error syncing churches after boundary removal:', syncErr);
      }

      return res.status(200).json({ success: true, removed: true });
    }

    if (role) {
      const { data: updatedLink, error: updateError } = await adminClient
        .from('city_platform_boundaries')
        .update({ role })
        .eq('id', existingLink.id)
        .select(`
          id,
          role,
          sort_order,
          added_at,
          boundary:boundaries(id, name, type, external_id)
        `)
        .single();

      if (updateError) {
        console.error('Error updating boundary:', updateError);
        return res.status(500).json({ error: 'Failed to update boundary' });
      }

      if (role === 'primary') {
        await adminClient
          .from('city_platform_boundaries')
          .update({ role: 'included' })
          .eq('city_platform_id', platformId)
          .neq('boundary_id', boundary_id)
          .eq('role', 'primary');

        await adminClient
          .from('city_platforms')
          .update({ primary_boundary_id: boundary_id })
          .eq('id', platformId);
      } else if (existingLink.role === 'primary' && role !== 'primary') {
        await adminClient
          .from('city_platforms')
          .update({ primary_boundary_id: null })
          .eq('id', platformId);
      }

      return res.status(200).json(updatedLink);
    }

    return res.status(400).json({ error: 'No update action specified' });

  } catch (error) {
    console.error('Error in PATCH /api/admin/city-platforms/:id/boundaries:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
