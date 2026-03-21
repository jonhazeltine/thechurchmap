import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../../lib/supabaseServer";
import { insertChurchPrayerRequestSchema } from "../../../../../shared/schema";

export async function POST(req: Request, res: Response) {
  try {
    const { id: churchId } = req.params;
    
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const isSuperAdmin = user.user_metadata?.super_admin === true;
    
    let isPlatformAdmin = false;
    if (!isSuperAdmin) {
      const { data: platformRole } = await adminClient
        .from('city_platform_users')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['super_admin', 'platform_owner', 'platform_admin'])
        .eq('is_active', true)
        .limit(1);

      isPlatformAdmin = !!(platformRole && platformRole.length > 0);
    }

    let isChurchAdmin = false;
    if (!isSuperAdmin && !isPlatformAdmin) {
      const userClient = supabaseUserClient(token);
      const { data: churchRole } = await userClient
        .from('church_user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('church_id', churchId)
        .eq('role', 'church_admin')
        .eq('is_approved', true)
        .maybeSingle();
      isChurchAdmin = !!churchRole;
    }

    const canCreateChurchRequest = isSuperAdmin || isPlatformAdmin || isChurchAdmin;
    
    if (!canCreateChurchRequest) {
      return res.status(403).json({ error: 'Only church admins can create church prayer requests' });
    }

    const body = {
      ...req.body,
      church_id: churchId,
    };

    const validationResult = insertChurchPrayerRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const { title, body: prayerBody, city_platform_id } = validationResult.data;

    const { data: church, error: churchError } = await adminClient
      .from('churches')
      .select('id, name')
      .eq('id', churchId)
      .single();

    if (churchError || !church) {
      return res.status(404).json({ error: 'Church not found' });
    }

    const prayerData = {
      church_id: churchId,
      submitted_by_user_id: user.id,
      title,
      body: prayerBody,
      is_anonymous: false,
      is_church_request: true,
      status: 'approved',
      city_platform_id: city_platform_id || null,
      display_first_name: church.name,
      display_last_initial: null,
    };

    const { data: prayer, error: prayerError } = await adminClient
      .from('prayers')
      .insert(prayerData)
      .select()
      .single();

    if (prayerError) {
      console.error('Error creating church prayer request:', prayerError);
      return res.status(500).json({ error: 'Failed to create prayer request' });
    }

    return res.status(201).json({
      prayer,
      message: 'Church prayer request created successfully'
    });
  } catch (error) {
    console.error('Error in POST /api/churches/[id]/church-prayer-request:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
