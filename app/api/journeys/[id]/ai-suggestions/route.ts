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

    // Get rich church details for church steps
    const churchIds = (steps || [])
      .filter(s => s.step_type === 'church' && s.church_id)
      .map(s => s.church_id!);

    let churches: any[] = [];
    if (churchIds.length > 0) {
      // Get core church data
      const { data: churchData } = await adminClient
        .from('churches')
        .select('id, name, city, state, denomination, description, collaboration_have, collaboration_need')
        .in('id', churchIds);

      // Get prayers for each church (what others have prayed)
      const { data: prayerData } = await adminClient
        .from('prayers')
        .select('church_id, title, body, is_church_request')
        .in('church_id', churchIds)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(50);

      // Build rich church objects
      churches = (churchData || []).map(church => {
        const churchPrayers = (prayerData || []).filter(p => p.church_id === church.id);
        const prayerRequests = churchPrayers.filter(p => p.is_church_request);
        const prayersFromOthers = churchPrayers.filter(p => !p.is_church_request);

        return {
          ...church,
          prayer_requests: prayerRequests.map(p => p.title || p.body).slice(0, 5),
          recent_prayers: prayersFromOthers.map(p => p.body).filter(Boolean).slice(0, 3),
          strengths: church.collaboration_have || [],
          needs: church.collaboration_need || [],
        };
      });
    }

    // Get health metric data for community need steps
    const metricKeys = (steps || [])
      .filter(s => s.step_type === 'community_need' && s.metric_key)
      .map(s => s.metric_key!);

    let metrics: any[] = [];
    if (metricKeys.length > 0) {
      const { data } = await adminClient
        .from('health_metrics')
        .select('metric_key, display_name, description, category_id')
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
