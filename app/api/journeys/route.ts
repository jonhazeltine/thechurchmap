import type { Request, Response } from "express";
import { supabaseServer } from "../../../lib/supabaseServer";
import { insertPrayerJourneySchema } from "../../../shared/schema";

// GET /api/journeys - List published journeys (optionally filter by platform/church)
export async function GET(req: Request, res: Response) {
  try {
    const { city_platform_id, church_id, status } = req.query;
    const adminClient = supabaseServer();
    const authHeader = req.headers.authorization;

    let userId: string | null = null;
    let userPrimaryChurchId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user } } = await adminClient.auth.getUser(token);
      if (user) {
        userId = user.id;
        // Get user's primary church for "my church" journey visibility
        const { data: profile } = await adminClient
          .from('profiles')
          .select('primary_church_id')
          .eq('user_id', user.id)
          .single();
        userPrimaryChurchId = profile?.primary_church_id || null;
      }
    }

    // Mode: drafts (own only)
    if (status === 'draft' && userId) {
      const { data, error } = await adminClient
        .from('prayer_journeys')
        .select('*, prayer_journey_steps(count)')
        .eq('created_by_user_id', userId)
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return res.json(data || []);
    }

    // Mode: church-specific (for church profile pages)
    if (church_id) {
      const { data, error } = await adminClient
        .from('prayer_journeys')
        .select('*, prayer_journey_steps(count)')
        .eq('church_id', church_id as string)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return res.json(data || []);
    }

    // Mode: main journey list (platform or national)
    // Rules:
    // 1. Platform-wide journeys (church_id IS NULL) require platform_approved = true
    // 2. Church-specific journeys only show if it's the user's primary church
    // 3. User's own journeys always show
    const { data: allPublished, error } = await adminClient
      .from('prayer_journeys')
      .select('*, prayer_journey_steps(count)')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    let filtered = (allPublished || []).filter((j: any) => {
      // Platform filter
      if (city_platform_id && j.city_platform_id !== city_platform_id) return false;

      // User's own journeys always visible
      if (userId && j.created_by_user_id === userId) return true;

      // Church-specific journey: only visible if it's the user's primary church
      if (j.church_id) {
        return userPrimaryChurchId === j.church_id;
      }

      // Platform-wide journey: requires platform approval
      return j.platform_approved === true;
    });

    return res.json(filtered.slice(0, 50));
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
