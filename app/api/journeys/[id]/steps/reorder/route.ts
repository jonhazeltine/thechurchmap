import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";

// PUT /api/journeys/:id/steps/reorder - Reorder steps
export async function PUT(req: Request, res: Response) {
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
      .select('created_by_user_id')
      .eq('id', id)
      .single();

    if (!journey || journey.created_by_user_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Expect body: { step_ids: string[] } - ordered array of step IDs
    const { step_ids } = req.body;
    if (!Array.isArray(step_ids)) {
      return res.status(400).json({ error: 'step_ids must be an array of step IDs in desired order' });
    }

    // Update each step's sort_order
    const updates = step_ids.map((stepId: string, index: number) =>
      adminClient
        .from('prayer_journey_steps')
        .update({ sort_order: index })
        .eq('id', stepId)
        .eq('journey_id', id)
    );

    await Promise.all(updates);

    // Return updated steps
    const { data: steps } = await adminClient
      .from('prayer_journey_steps')
      .select('*')
      .eq('journey_id', id)
      .order('sort_order', { ascending: true });

    return res.json(steps || []);
  } catch (error) {
    console.error('Error in PUT /api/journeys/[id]/steps/reorder:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
