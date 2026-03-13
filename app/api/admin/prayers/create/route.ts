import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { createAdminPrayerSchema } from "@shared/schema";

/**
 * POST /api/admin/prayers/create
 * Create a global or regional prayer request (platform admin only)
 * Auto-approves and makes immediately visible
 */
export async function POST(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const body = req.body;
    
    // Validate request body
    const validation = createAdminPrayerSchema.safeParse(body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid request body', 
        details: validation.error.flatten() 
      });
    }

    const { title, body: prayerBody, global, platform_wide, region_type, region_id, area_id, submitter_name, city_platform_id } = validation.data;
    
    // Verify JWT with admin client (service role)
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is platform admin
    const { data: platformRoles } = await adminClient
      .from('platform_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const isPlatformAdmin = (platformRoles || []).length > 0;

    if (!isPlatformAdmin) {
      return res.status(403).json({ error: 'Platform admin access required' });
    }

    // Parse submitter name into first name and last initial if provided
    let display_first_name = null;
    let display_last_initial = null;
    
    if (submitter_name) {
      const parts = submitter_name.trim().split(' ');
      display_first_name = parts[0];
      if (parts.length > 1) {
        display_last_initial = parts[parts.length - 1].charAt(0).toUpperCase();
      }
    }

    // Create prayer with auto-approved status
    // Note: platform_wide prayers are indicated by having city_platform_id set but no region_type
    const prayerData: any = {
      title,
      body: prayerBody,
      status: 'approved',
      is_anonymous: false,
      display_first_name,
      display_last_initial,
      global: global || false,
      region_type: platform_wide ? null : (region_type || null), // Clear region for platform-wide
      region_id: platform_wide ? null : (region_id || null), // Clear region for platform-wide
      area_id: area_id || null,
      church_id: null, // Global/regional prayers are not church-specific
      submitted_by_user_id: user.id,
      approved_at: new Date().toISOString(),
      approved_by_user_id: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      city_platform_id: city_platform_id || null, // City platform scoping (Phase 5C)
    };

    const { data: prayer, error: insertError } = await adminClient
      .from('prayers')
      .insert(prayerData)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating prayer:', insertError);
      return res.status(500).json({ 
        error: 'Failed to create prayer',
        details: insertError.message 
      });
    }

    console.log('✅ Admin prayer created:', {
      id: prayer.id,
      global: prayer.global,
      platform_wide: platform_wide || false,
      region_type: prayer.region_type,
      city_platform_id: prayer.city_platform_id,
      created_by: user.email,
    });

    return res.status(201).json(prayer);

  } catch (error) {
    console.error('Error in create admin prayer:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
