import type { Request, Response } from "express";
import { supabaseServer } from "../../../lib/supabaseServer";
import { insertPrayerJourneySchema } from "../../../shared/schema";

// GET /api/journeys - List published journeys (optionally filter by platform/church)
export async function GET(req: Request, res: Response) {
  try {
    const { city_platform_id, church_id, status } = req.query;
    const adminClient = supabaseServer();

    let query = adminClient
      .from('prayer_journeys')
      .select('*, prayer_journey_steps(count)')
      .order('created_at', { ascending: false });

    // If authenticated, include user's own drafts
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user } } = await adminClient.auth.getUser(token);
      if (user && status === 'draft') {
        query = query.eq('created_by_user_id', user.id).eq('status', 'draft');
      } else {
        query = query.eq('status', 'published');
      }
    } else {
      query = query.eq('status', 'published');
    }

    if (city_platform_id) {
      query = query.eq('city_platform_id', city_platform_id as string);
    }
    if (church_id) {
      query = query.eq('church_id', church_id as string);
    }

    const { data, error } = await query.limit(50);

    if (error) {
      console.error('Error listing journeys:', error);
      return res.status(500).json({ error: 'Failed to list journeys' });
    }

    return res.json(data || []);
  } catch (error) {
    console.error('Error in GET /api/journeys:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/journeys - Create a new journey (draft)
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
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Verify admin role (church_admin, platform_admin, or super_admin)
    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      const { data: roles } = await adminClient
        .from('church_user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'church_admin')
        .eq('is_approved', true)
        .limit(1);

      const { data: platformRoles } = await adminClient
        .from('city_platform_users')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['platform_admin', 'platform_owner'])
        .eq('is_active', true)
        .limit(1);

      const hasAdminRole = (roles && roles.length > 0) || (platformRoles && platformRoles.length > 0);
      if (!hasAdminRole) {
        return res.status(403).json({ error: 'Only church or platform admins can create prayer journeys' });
      }
    }

    const validationResult = insertPrayerJourneySchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const { data: journey, error: insertError } = await adminClient
      .from('prayer_journeys')
      .insert({
        ...validationResult.data,
        created_by_user_id: user.id,
        status: 'draft',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating journey:', insertError);
      return res.status(500).json({ error: 'Failed to create journey' });
    }

    return res.status(201).json(journey);
  } catch (error) {
    console.error('Error in POST /api/journeys:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
