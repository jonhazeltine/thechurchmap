import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";

// GET /api/journeys/share/:shareToken - Get journey by share token (public, no auth)
export async function GET(req: Request, res: Response) {
  try {
    const { shareToken } = req.params;
    const adminClient = supabaseServer();

    const { data: journey, error } = await adminClient
      .from('prayer_journeys')
      .select('*')
      .eq('share_token', shareToken)
      .eq('status', 'published')
      .single();

    if (error || !journey) {
      return res.status(404).json({ error: 'Journey not found' });
    }

    // Fetch non-excluded steps
    const { data: steps } = await adminClient
      .from('prayer_journey_steps')
      .select('*')
      .eq('journey_id', journey.id)
      .eq('is_excluded', false)
      .order('sort_order', { ascending: true });

    // Enrich church steps with banner/photo/location data
    const churchIds = (steps || [])
      .filter(s => s.step_type === 'church' && s.church_id)
      .map(s => s.church_id);

    let churchMap = new Map<string, any>();
    if (churchIds.length > 0) {
      const { data: churches } = await adminClient
        .from('churches')
        .select('id, name, banner_image_url, profile_photo_url, denomination, city, state, latitude, longitude, display_lat, display_lng')
        .in('id', churchIds);
      if (churches) {
        for (const c of churches) churchMap.set(c.id, c);
      }
    }

    const enrichedSteps = (steps || []).map(step => {
      if (step.step_type === 'church' && step.church_id && churchMap.has(step.church_id)) {
        const church = churchMap.get(step.church_id);
        return { ...step, church_data: church };
      }
      return step;
    });

    return res.json({ ...journey, steps: enrichedSteps });
  } catch (error) {
    console.error('Error in GET /api/journeys/share/[shareToken]:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
