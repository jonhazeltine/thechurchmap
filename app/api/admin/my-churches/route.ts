import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

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

    // Get church IDs from city_platform_users where role is church_admin
    const { data: cpuRoles } = await adminClient
      .from('city_platform_users')
      .select('church_id')
      .eq('user_id', user.id)
      .eq('role', 'church_admin')
      .eq('is_active', true)
      .not('church_id', 'is', null);
    
    // Also check legacy church_user_roles table (role can be 'admin' or 'church_admin')
    const { data: legacyRoles } = await adminClient
      .from('church_user_roles')
      .select('church_id')
      .eq('user_id', user.id)
      .in('role', ['admin', 'church_admin'])
      .eq('is_approved', true);
    
    // Combine church IDs from both sources
    const churchIds = new Set<string>();
    (cpuRoles || []).forEach(r => {
      if (r.church_id) churchIds.add(r.church_id);
    });
    (legacyRoles || []).forEach(r => {
      if (r.church_id) churchIds.add(r.church_id);
    });
    
    if (churchIds.size === 0) {
      return res.status(200).json([]);
    }
    
    // Fetch church details
    const { data: churches, error: churchError } = await adminClient
      .from('churches')
      .select(`
        id,
        name,
        address,
        city,
        state,
        zip,
        phone,
        website,
        profile_photo_url,
        location
      `)
      .in('id', Array.from(churchIds))
      .order('name');
    
    if (churchError) {
      console.error('Error fetching churches:', churchError);
      return res.status(500).json({ error: 'Failed to fetch churches' });
    }

    // Look up platform info for each church
    const churchIdArray = Array.from(churchIds);
    const { data: platformLinks } = await adminClient
      .from('city_platform_churches')
      .select(`
        church_id,
        city_platform_id,
        city_platforms!inner(id, name, slug)
      `)
      .in('church_id', churchIdArray);

    const platformByChurch = new Map<string, { id: string; name: string; slug: string }>();
    (platformLinks || []).forEach((link: any) => {
      if (link.church_id && link.city_platforms) {
        platformByChurch.set(link.church_id, {
          id: link.city_platforms.id,
          name: link.city_platforms.name,
          slug: link.city_platforms.slug,
        });
      }
    });

    const enriched = (churches || []).map((c: any) => ({
      ...c,
      platform: platformByChurch.get(c.id) || null,
    }));
    
    return res.status(200).json(enriched);
  } catch (error) {
    console.error('Error in my-churches endpoint:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
