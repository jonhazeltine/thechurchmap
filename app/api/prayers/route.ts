import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../lib/supabaseServer";
import { insertPrayerSchema } from "../../../shared/schema";
import { storage } from "../../../server/storage";

export async function POST(req: Request, res: Response) {
  try {
    // Verify user authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const userClient = supabaseUserClient(token);
    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Validate request body
    const validationResult = insertPrayerSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const { church_id, title, body, is_anonymous, city_platform_id, scope_type, tract_id, click_lat, click_lng } = validationResult.data;

    console.log('Prayer submission - church_id:', church_id, 'city_platform_id:', city_platform_id, 'scope_type:', scope_type);

    // Verify church exists
    const { data: church, error: churchError } = await supabaseServer()
      .from('churches')
      .select('id, name')
      .eq('id', church_id)
      .single();

    if (churchError || !church) {
      console.error('Church lookup failed:', {
        church_id,
        error: churchError,
        church: church
      });
      return res.status(404).json({ error: 'Church not found' });
    }

    console.log('Church found:', church.name);

    // Get user profile for display name
    const { data: profile } = await supabaseServer()
      .from('profiles')
      .select('first_name, last_name')
      .eq('user_id', user.id)
      .single();

    // Create prayer request with appropriate status
    const prayerData: any = {
      church_id,
      submitted_by_user_id: user.id,
      title,
      body,
      is_anonymous,
      status: 'pending', // All prayers start as pending
      city_platform_id: city_platform_id || null, // City platform scoping (Phase 5C)
      scope_type: scope_type || null,
      tract_id: scope_type === 'tract' ? (tract_id || null) : null,
      click_lat: click_lat ?? null,
      click_lng: click_lng ?? null,
    };

    // Add display name if not anonymous
    if (!is_anonymous && profile) {
      prayerData.display_first_name = profile.first_name;
      prayerData.display_last_initial = profile.last_name?.charAt(0) || '';
    }

    const { data: prayer, error: prayerError } = await supabaseServer()
      .from('prayers')
      .insert(prayerData)
      .select()
      .single();

    if (prayerError) {
      console.error('Error creating prayer:', prayerError);
      return res.status(500).json({ error: 'Failed to create prayer request' });
    }

    if (church_id) {
      try {
        await storage.recordChurchActivity(church_id, 'prayer_submitted');
      } catch (engagementError) {
        console.error('Non-critical: failed to record engagement activity:', engagementError);
      }
    }

    return res.status(201).json({
      prayer,
      message: 'Prayer request submitted for review'
    });
  } catch (error) {
    console.error('Error in POST /api/prayers:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
