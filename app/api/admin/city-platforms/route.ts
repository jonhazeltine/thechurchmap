import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";
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

    const { data: platforms, error: platformsError } = await adminClient
      .from('city_platforms')
      .select(`
        *,
        primary_boundary:boundaries!city_platforms_primary_boundary_id_fkey(id, name, type)
      `)
      .order('created_at', { ascending: false });

    if (platformsError) {
      console.error('Error fetching platforms:', platformsError);
      return res.status(500).json({ error: 'Failed to fetch city platforms' });
    }

    const { data: churchCounts } = await adminClient
      .from('city_platform_churches')
      .select('city_platform_id');

    const churchCountMap = new Map<string, number>();
    if (churchCounts) {
      churchCounts.forEach((row) => {
        const current = churchCountMap.get(row.city_platform_id) || 0;
        churchCountMap.set(row.city_platform_id, current + 1);
      });
    }

    const { data: ownerRoles } = await adminClient
      .from('city_platform_users')
      .select('city_platform_id, user_id, role')
      .in('role', ['platform_owner', 'platform_admin']);

    const ownerCountMap = new Map<string, number>();
    if (ownerRoles) {
      ownerRoles.forEach((row) => {
        if (row.city_platform_id) {
          const current = ownerCountMap.get(row.city_platform_id) || 0;
          ownerCountMap.set(row.city_platform_id, current + 1);
        }
      });
    }

    const platformsWithMetrics = (platforms || []).map((platform) => ({
      ...platform,
      church_count: churchCountMap.get(platform.id) || 0,
      owner_count: ownerCountMap.get(platform.id) || 0,
    }));

    return res.status(200).json(platformsWithMetrics);

  } catch (error) {
    console.error('Error in admin city-platforms GET:', error);
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

    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const parseResult = insertCityPlatformSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: parseResult.error.flatten() 
      });
    }

    const { data: existingSlug } = await adminClient
      .from('city_platforms')
      .select('id')
      .eq('slug', parseResult.data.slug)
      .single();

    if (existingSlug) {
      return res.status(409).json({ error: 'A platform with this slug already exists' });
    }

    const { data: platform, error: insertError } = await adminClient
      .from('city_platforms')
      .insert({
        ...parseResult.data,
        created_by_user_id: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating platform:', insertError);
      return res.status(500).json({ error: 'Failed to create city platform' });
    }

    // If a primary boundary was selected, also create the city_platform_boundaries record
    // and auto-link churches within the boundary
    if (parseResult.data.primary_boundary_id) {
      const { error: boundaryLinkError } = await adminClient
        .from('city_platform_boundaries')
        .insert({
          city_platform_id: platform.id,
          boundary_id: parseResult.data.primary_boundary_id,
          role: 'primary',
          sort_order: 1,
          added_by_user_id: user.id,
        });

      if (boundaryLinkError) {
        console.error('Error linking boundary to platform:', boundaryLinkError);
        // Don't fail the request - platform was created, just log the error
      } else {
        console.log('Successfully linked primary boundary to platform');
        
        // Auto-link churches within the boundary
        try {
          const { data: churchesInBoundary, error: churchError } = await adminClient.rpc(
            'fn_churches_within_boundaries',
            { p_boundary_ids: [parseResult.data.primary_boundary_id] }
          );
          
          if (churchError) {
            console.error('Error finding churches in boundary:', churchError);
          } else if (churchesInBoundary && churchesInBoundary.length > 0) {
            console.log(`Found ${churchesInBoundary.length} churches within boundary`);
            
            // Insert church links (RPC returns church_id, not id)
            const churchLinks = churchesInBoundary.map((church: { church_id: string }) => ({
              city_platform_id: platform.id,
              church_id: church.church_id,
              status: 'visible',
            }));
            
            const { error: linkError } = await adminClient
              .from('city_platform_churches')
              .insert(churchLinks);
              
            if (linkError) {
              console.error('Error linking churches to platform:', linkError);
            } else {
              console.log(`Successfully linked ${churchesInBoundary.length} churches to platform`);
            }
          } else {
            console.log('No churches found within boundary');
          }
        } catch (e) {
          console.error('Error in church auto-linking:', e);
        }
      }
    }

    // Auto-add the creator as platform_owner so it appears in their dropdown
    console.log('Creating platform owner record:', { platformId: platform.id, userId: user.id });
    
    const { data: ownerData, error: ownerError } = await adminClient
      .from('city_platform_users')
      .insert({
        city_platform_id: platform.id,
        user_id: user.id,
        role: 'platform_owner',
        is_active: true,
      })
      .select()
      .single();

    if (ownerError) {
      console.error('Error adding creator as platform owner:', ownerError);
      // Don't fail the request - platform was created, just log the error
    } else {
      console.log('Successfully added creator as platform owner:', ownerData);
    }

    return res.status(201).json(platform);

  } catch (error) {
    console.error('Error in admin city-platforms POST:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
