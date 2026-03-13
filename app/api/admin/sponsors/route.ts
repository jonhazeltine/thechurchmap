import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";
import { insertSponsorSchema } from "@shared/schema";

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

    const { level, is_active, city_platform_id } = req.query;

    let query = adminClient
      .from('sponsors')
      .select(`
        *,
        city_platform:city_platforms!sponsors_city_platform_id_fkey (id, name),
        assignments:sponsor_assignments (
          id,
          church_id,
          city_platform_id,
          platform_region_id,
          is_active,
          church:churches!sponsor_assignments_church_id_fkey (id, name, city, state),
          platform:city_platforms!sponsor_assignments_city_platform_id_fkey (id, name),
          region:platform_regions!sponsor_assignments_platform_region_id_fkey (id, name)
        )
      `)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (level) {
      query = query.eq('level', level);
    }
    if (is_active !== undefined) {
      query = query.eq('is_active', is_active === 'true');
    }
    if (city_platform_id) {
      query = query.eq('city_platform_id', city_platform_id);
    }

    const { data: sponsors, error: sponsorsError } = await query;

    if (sponsorsError) {
      console.error('Error fetching sponsors:', sponsorsError);
      return res.status(500).json({ error: 'Failed to fetch sponsors' });
    }

    // Return format expected by frontend: { sponsors: [...], total: number }
    return res.json({
      sponsors: sponsors || [],
      total: (sponsors || []).length,
    });
  } catch (error) {
    console.error('Error in GET /api/admin/sponsors:', error);
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

    const validationResult = insertSponsorSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const sponsorData = validationResult.data;

    const { data: sponsor, error: insertError } = await adminClient
      .from('sponsors')
      .insert({
        name: sponsorData.name,
        logo_url: sponsorData.logo_url || null,
        website_url: sponsorData.website_url || null,
        contact_email: sponsorData.contact_email || null,
        contact_phone: sponsorData.contact_phone,
        description: sponsorData.description,
        level: sponsorData.level,
        sponsor_type: sponsorData.sponsor_type || 'other',
        nmls_number: sponsorData.nmls_number || null,
        agent_license_number: sponsorData.agent_license_number || null,
        is_active: sponsorData.is_active,
        sort_order: sponsorData.sort_order,
        city_platform_id: sponsorData.city_platform_id || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating sponsor:', insertError);
      return res.status(500).json({ error: 'Failed to create sponsor' });
    }

    return res.status(201).json(sponsor);
  } catch (error) {
    console.error('Error in POST /api/admin/sponsors:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
