import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";

// POST /api/journeys/:id/publish - Publish a journey
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

    const { data: journey } = await adminClient
      .from('prayer_journeys')
      .select('created_by_user_id, status')
      .eq('id', id)
      .single();

    if (!journey || journey.created_by_user_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Get all steps to determine max sort_order and check for existing closing slides
    const { data: allSteps } = await adminClient
      .from('prayer_journey_steps')
      .select('id, step_type, sort_order')
      .eq('journey_id', id)
      .order('sort_order', { ascending: false });

    const steps = allSteps || [];
    const maxOrder = steps.length > 0 ? steps[0].sort_order : 0;
    const hasThankgiving = steps.some(s => s.step_type === 'thanksgiving');
    const hasPrayerRequest = steps.some(s => s.step_type === 'prayer_request');

    // Auto-add thanksgiving slide if not already present
    if (!hasThankgiving) {
      await adminClient.from('prayer_journey_steps').insert({
        journey_id: id,
        sort_order: maxOrder + 1,
        step_type: 'thanksgiving',
        title: 'A Prayer of Thanksgiving',
        body: 'Heavenly Father, we thank You for the churches and communities we have lifted up in prayer. Thank You for hearing our prayers and for the work You are already doing in these neighborhoods. We trust that You are faithful to complete the good work You have begun.',
        scripture_ref: 'Psalm 136:1',
        scripture_text: 'Give thanks to the Lord, for he is good, for his steadfast love endures forever.',
        ai_generated: true,
      });
    }

    // Auto-add prayer request slide if not already present
    if (!hasPrayerRequest) {
      await adminClient.from('prayer_journey_steps').insert({
        journey_id: id,
        sort_order: maxOrder + (hasThankgiving ? 1 : 2),
        step_type: 'prayer_request',
        title: 'Is there anything we can pray for you?',
        body: 'Share your prayer request and the community will lift you up in prayer.',
      });
    }

    // Check that the journey has at least one non-excluded step
    const { data: activeSteps } = await adminClient
      .from('prayer_journey_steps')
      .select('id')
      .eq('journey_id', id)
      .eq('is_excluded', false);

    if (!activeSteps || activeSteps.length === 0) {
      return res.status(400).json({ error: 'Journey must have at least one active step to publish' });
    }

    const { data: updated, error } = await adminClient
      .from('prayer_journeys')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error publishing journey:', error);
      return res.status(500).json({ error: 'Failed to publish journey' });
    }

    return res.json(updated);
  } catch (error) {
    console.error('Error in POST /api/journeys/[id]/publish:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
