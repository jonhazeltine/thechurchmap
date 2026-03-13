import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";
import { updatePlatformSettingsSchema } from "@shared/schema";

function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

async function resolvePlatformId(
  adminClient: ReturnType<typeof supabaseServer>,
  idOrSlug: string
): Promise<string | null> {
  if (isUUID(idOrSlug)) {
    return idOrSlug;
  }
  
  const { data: platform } = await adminClient
    .from('city_platforms')
    .select('id')
    .eq('slug', idOrSlug)
    .single();
  
  return platform?.id || null;
}

async function checkPlatformAccess(
  adminClient: ReturnType<typeof supabaseServer>,
  userId: string,
  platformId: string,
  userMetadata: any
): Promise<{ hasAccess: boolean; isSuperAdmin: boolean; isOwner: boolean }> {
  const isSuperAdmin = userMetadata?.super_admin === true;
  
  if (isSuperAdmin) {
    return { hasAccess: true, isSuperAdmin: true, isOwner: true };
  }

  const { data: userRole } = await adminClient
    .from('city_platform_users')
    .select('role')
    .eq('city_platform_id', platformId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  const isOwner = userRole?.role === 'platform_owner';
  
  return { 
    hasAccess: isOwner, 
    isSuperAdmin: false, 
    isOwner 
  };
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

    const { id: idOrSlug } = req.params;

    const platformId = await resolvePlatformId(adminClient, idOrSlug);
    if (!platformId) {
      return res.status(404).json({ error: 'Platform not found' });
    }

    const { hasAccess } = await checkPlatformAccess(
      adminClient,
      user.id,
      platformId,
      user.user_metadata
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Only platform owners can access settings' });
    }

    const { data: platform, error: platformError } = await adminClient
      .from('city_platforms')
      .select(`
        id,
        name,
        slug,
        description,
        is_active,
        is_public,
        auto_approve_members,
        display_lds_churches,
        display_jw_churches,
        logo_url,
        banner_url,
        website,
        contact_email,
        primary_boundary_id,
        default_center_lat,
        default_center_lng,
        default_zoom,
        created_at,
        updated_at,
        primary_boundary:boundaries!city_platforms_primary_boundary_id_fkey(id, name, type)
      `)
      .eq('id', platformId)
      .single();

    if (platformError) {
      if (platformError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Platform not found' });
      }
      console.error('Error fetching platform settings:', platformError);
      return res.status(500).json({ error: 'Failed to fetch platform settings' });
    }

    const { count: boundaryCount } = await adminClient
      .from('city_platform_boundaries')
      .select('id', { count: 'exact', head: true })
      .eq('city_platform_id', platformId);

    const { count: memberCount } = await adminClient
      .from('city_platform_users')
      .select('id', { count: 'exact', head: true })
      .eq('city_platform_id', platformId)
      .eq('is_active', true);

    return res.status(200).json({
      ...platform,
      boundary_count: boundaryCount || 0,
      member_count: memberCount || 0,
    });

  } catch (error) {
    console.error('Error in GET /api/admin/platform/:id/settings:', error);
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

    const { id: idOrSlug } = req.params;

    const platformId = await resolvePlatformId(adminClient, idOrSlug);
    if (!platformId) {
      return res.status(404).json({ error: 'Platform not found' });
    }

    const { hasAccess } = await checkPlatformAccess(
      adminClient,
      user.id,
      platformId,
      user.user_metadata
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Only platform owners can update settings' });
    }

    const parseResult = updatePlatformSettingsSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parseResult.error.flatten() 
      });
    }

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (parseResult.data.name !== undefined) {
      updateData.name = parseResult.data.name;
    }
    if (parseResult.data.description !== undefined) {
      updateData.description = parseResult.data.description || null;
    }
    if (parseResult.data.is_active !== undefined) {
      updateData.is_active = parseResult.data.is_active;
      if (parseResult.data.is_active && !updateData.activated_at) {
        const { data: currentPlatform } = await adminClient
          .from('city_platforms')
          .select('activated_at')
          .eq('id', platformId)
          .single();
        
        if (!currentPlatform?.activated_at) {
          updateData.activated_at = new Date().toISOString();
        }
      }
    }
    if (parseResult.data.is_public !== undefined) {
      updateData.is_public = parseResult.data.is_public;
    }
    if (parseResult.data.auto_approve_members !== undefined) {
      updateData.auto_approve_members = parseResult.data.auto_approve_members;
    }
    if (parseResult.data.display_lds_churches !== undefined) {
      updateData.display_lds_churches = parseResult.data.display_lds_churches;
    }
    if (parseResult.data.display_jw_churches !== undefined) {
      updateData.display_jw_churches = parseResult.data.display_jw_churches;
    }
    if (parseResult.data.logo_url !== undefined) {
      updateData.logo_url = parseResult.data.logo_url || null;
    }
    if (parseResult.data.banner_url !== undefined) {
      updateData.banner_url = parseResult.data.banner_url || null;
    }
    if (parseResult.data.website !== undefined) {
      updateData.website = parseResult.data.website || null;
    }
    if (parseResult.data.contact_email !== undefined) {
      updateData.contact_email = parseResult.data.contact_email || null;
    }

    // Slug updates require super admin privileges
    if (parseResult.data.slug !== undefined) {
      const isSuperAdmin = user.user_metadata?.super_admin === true;
      if (!isSuperAdmin) {
        return res.status(403).json({ error: 'Only super admins can change platform slugs' });
      }

      const newSlug = parseResult.data.slug.toLowerCase();

      // Check for uniqueness
      const { data: existingPlatform } = await adminClient
        .from('city_platforms')
        .select('id')
        .eq('slug', newSlug)
        .neq('id', platformId)
        .maybeSingle();

      if (existingPlatform) {
        return res.status(409).json({ error: 'A platform with this slug already exists' });
      }

      updateData.slug = newSlug;
    }

    const { data: platform, error: updateError } = await adminClient
      .from('city_platforms')
      .update(updateData)
      .eq('id', platformId)
      .select(`
        id,
        name,
        slug,
        description,
        is_active,
        is_public,
        auto_approve_members,
        display_lds_churches,
        display_jw_churches,
        logo_url,
        banner_url,
        website,
        contact_email,
        primary_boundary_id,
        default_center_lat,
        default_center_lng,
        default_zoom,
        created_at,
        updated_at,
        primary_boundary:boundaries!city_platforms_primary_boundary_id_fkey(id, name, type)
      `)
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Platform not found' });
      }
      console.error('Error updating platform settings:', updateError);
      return res.status(500).json({ error: 'Failed to update platform settings' });
    }

    return res.status(200).json(platform);

  } catch (error) {
    console.error('Error in PATCH /api/admin/platform/:id/settings:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
