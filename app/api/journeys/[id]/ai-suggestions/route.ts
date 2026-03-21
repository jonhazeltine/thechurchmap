import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { generateJourneySuggestions } from "../../../../../server/services/journey-ai";

// POST /api/journeys/:id/ai-suggestions - Generate AI prayer/scripture suggestions
export async function POST(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();

    const { data: { user } } = await adminClient.auth.getUser(token);
    if (!user) return res.status(401).json({ error: 'Invalid token' });

    // Verify ownership
    const { data: journey } = await adminClient
      .from('prayer_journeys')
      .select('*')
      .eq('id', id)
      .single();

    if (!journey || journey.created_by_user_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Get existing steps for context
    const { data: steps } = await adminClient
      .from('prayer_journey_steps')
      .select('*')
      .eq('journey_id', id)
      .order('sort_order', { ascending: true });

    // Get church details for church steps
    const churchIds = (steps || [])
      .filter(s => s.step_type === 'church' && s.church_id)
      .map(s => s.church_id!);

    let churches: any[] = [];
    if (churchIds.length > 0) {
      const { data } = await adminClient
        .from('churches')
        .select('id, name, city, state, denomination')
        .in('id', churchIds);
      churches = data || [];
    }

    // Get health metric data for community need steps
    const metricKeys = (steps || [])
      .filter(s => s.step_type === 'community_need' && s.metric_key)
      .map(s => s.metric_key!);

    let metrics: any[] = [];
    if (metricKeys.length > 0) {
      const { data } = await adminClient
        .from('health_metrics')
        .select('metric_key, display_name, category_id')
        .in('metric_key', metricKeys);
      metrics = data || [];
    }

    // Get custom steps for context
    const customSteps = (steps || [])
      .filter(s => s.step_type === 'custom')
      .map(s => ({ title: s.title, body: s.body }));

    const suggestions = await generateJourneySuggestions({
      churches,
      metrics,
      customSteps,
      journeyTitle: journey.title,
      journeyDescription: journey.description,
    });

    return res.json(suggestions);
  } catch (error) {
    console.error('Error in POST /api/journeys/[id]/ai-suggestions:', error);
    return res.status(500).json({ error: 'Failed to generate suggestions' });
  }
}
