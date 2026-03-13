import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { insertCityPlatformSchema } from "@shared/schema";

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

    const { id } = req.params;

    const { data: platform, error: platformError } = await adminClient
      .from('city_platforms')
      .select(`
        *,
        primary_boundary:boundaries!city_platforms_primary_boundary_id_fkey(id, name, type),
        boundaries:city_platform_boundaries(
          id, role, sort_order,
          boundary:boundaries(id, name, type)
        ),
        owners:city_platform_users(
          id, user_id, role, is_active,
          user:profiles(id, email, display_name, avatar_url)
        )
      `)
      .eq('id', id)
      .single();

    if (platformError) {
      if (platformError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Platform not found' });
      }
      console.error('Error fetching platform:', platformError);
      return res.status(500).json({ error: 'Failed to fetch platform' });
    }

    const { count: churchCount } = await adminClient
      .from('city_platform_churches')
      .select('id', { count: 'exact', head: true })
      .eq('city_platform_id', id);

    return res.status(200).json({
      ...platform,
      church_count: churchCount || 0,
    });

  } catch (error) {
    console.error('Error in admin city-platforms/:id GET:', error);
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

    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const { id } = req.params;

    const updateSchema = insertCityPlatformSchema.partial();
    const parseResult = updateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parseResult.error.flatten() 
      });
    }

    if (parseResult.data.slug) {
      const { data: existingSlug } = await adminClient
        .from('city_platforms')
        .select('id')
        .eq('slug', parseResult.data.slug)
        .neq('id', id)
        .single();

      if (existingSlug) {
        return res.status(409).json({ error: 'A platform with this slug already exists' });
      }
    }

    const { data: platform, error: updateError } = await adminClient
      .from('city_platforms')
      .update({
        ...parseResult.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Platform not found' });
      }
      console.error('Error updating platform:', updateError);
      return res.status(500).json({ error: 'Failed to update platform' });
    }

    return res.status(200).json(platform);

  } catch (error) {
    console.error('Error in admin city-platforms/:id PATCH:', error);
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
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const { id } = req.params;

    // Verify platform exists
    const { data: platform, error: platformError } = await adminClient
      .from('city_platforms')
      .select('id, name')
      .eq('id', id)
      .single();

    if (platformError) {
      if (platformError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Platform not found' });
      }
      console.error('Error fetching platform:', platformError);
      return res.status(500).json({ error: 'Failed to fetch platform' });
    }

    // Delete related records in order (cascade cleanup)
    // 1. Delete platform boundaries
    const { error: boundariesError } = await adminClient
      .from('city_platform_boundaries')
      .delete()
      .eq('city_platform_id', id);
    
    if (boundariesError) {
      console.error('Error deleting platform boundaries:', boundariesError);
    }

    // 2. Delete platform churches
    const { error: churchesError } = await adminClient
      .from('city_platform_churches')
      .delete()
      .eq('city_platform_id', id);
    
    if (churchesError) {
      console.error('Error deleting platform churches:', churchesError);
    }

    // 3. Delete platform users
    const { error: usersError } = await adminClient
      .from('city_platform_users')
      .delete()
      .eq('city_platform_id', id);
    
    if (usersError) {
      console.error('Error deleting platform users:', usersError);
    }

    // 4. Delete platform membership requests
    const { error: requestsError } = await adminClient
      .from('platform_membership_requests')
      .delete()
      .eq('city_platform_id', id);
    
    if (requestsError) {
      console.error('Error deleting membership requests:', requestsError);
    }

    // 5. Delete platform applications that reference this platform
    const { error: appsError } = await adminClient
      .from('platform_applications')
      .delete()
      .eq('approved_platform_id', id);
    
    if (appsError) {
      console.error('Error deleting platform applications:', appsError);
    }

    // 6. Finally delete the platform itself
    const { error: deleteError } = await adminClient
      .from('city_platforms')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting platform:', deleteError);
      return res.status(500).json({ error: 'Failed to delete platform' });
    }

    console.log(`Successfully deleted platform: ${platform.name} (${id})`);
    return res.status(200).json({ success: true, deleted: platform.name });

  } catch (error) {
    console.error('Error in admin city-platforms/:id DELETE:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
