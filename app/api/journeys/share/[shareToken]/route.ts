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

    return res.json({ ...journey, steps: steps || [] });
  } catch (error) {
    console.error('Error in GET /api/journeys/share/[shareToken]:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
