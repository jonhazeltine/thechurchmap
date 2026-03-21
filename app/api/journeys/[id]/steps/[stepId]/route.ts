import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";
import { updatePrayerJourneyStepSchema } from "../../../../../../shared/schema";

// PATCH /api/journeys/:id/steps/:stepId - Update step
export async function PATCH(req: Request, res: Response) {
  try {
    const { id, stepId } = req.params;
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

    const validationResult = updatePrayerJourneyStepSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors,
      });
    }

    const { data: updated, error } = await adminClient
      .from('prayer_journey_steps')
      .update(validationResult.data)
      .eq('id', stepId)
      .eq('journey_id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating step:', error);
      return res.status(500).json({ error: 'Failed to update step' });
    }

    return res.json(updated);
  } catch (error) {
    console.error('Error in PATCH /api/journeys/[id]/steps/[stepId]:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// DELETE /api/journeys/:id/steps/:stepId - Delete step
export async function DELETE(req: Request, res: Response) {
  try {
    const { id, stepId } = req.params;
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

    const { error } = await adminClient
      .from('prayer_journey_steps')
      .delete()
      .eq('id', stepId)
      .eq('journey_id', id);

    if (error) {
      console.error('Error deleting step:', error);
      return res.status(500).json({ error: 'Failed to delete step' });
    }

    return res.json({ message: 'Step deleted' });
  } catch (error) {
    console.error('Error in DELETE /api/journeys/[id]/steps/[stepId]:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
