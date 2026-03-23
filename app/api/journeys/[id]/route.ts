import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";
import { updatePrayerJourneySchema } from "../../../../shared/schema";

// GET /api/journeys/:id - Get journey with steps
export async function GET(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const adminClient = supabaseServer();

    const { data: journey, error } = await adminClient
      .from('prayer_journeys')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !journey) {
      return res.status(404).json({ error: 'Journey not found' });
    }

    // Check access: published journeys are public, drafts require ownership
    if (journey.status !== 'published') {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(404).json({ error: 'Journey not found' });
      }
      const token = authHeader.substring(7);
      const { data: { user } } = await adminClient.auth.getUser(token);
      if (!user || user.id !== journey.created_by_user_id) {
        return res.status(404).json({ error: 'Journey not found' });
      }
    }

    // Fetch steps
    const { data: steps } = await adminClient
      .from('prayer_journey_steps')
      .select('*')
      .eq('journey_id', id)
      .order('sort_order', { ascending: true });

    // Enrich church steps with banner/photo data
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
    console.error('Error in GET /api/journeys/[id]:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// PATCH /api/journeys/:id - Update journey
export async function PATCH(req: Request, res: Response) {
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
      .select('created_by_user_id')
      .eq('id', id)
      .single();

    if (!journey || journey.created_by_user_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized to edit this journey' });
    }

    const validationResult = updatePrayerJourneySchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const { data: updated, error } = await adminClient
      .from('prayer_journeys')
      .update({ ...validationResult.data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating journey:', error);
      return res.status(500).json({ error: 'Failed to update journey' });
    }

    return res.json(updated);
  } catch (error) {
    console.error('Error in PATCH /api/journeys/[id]:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// DELETE /api/journeys/:id - Delete journey
export async function DELETE(req: Request, res: Response) {
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
      return res.status(403).json({ error: 'Not authorized to delete this journey' });
    }

    const { error } = await adminClient
      .from('prayer_journeys')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting journey:', error);
      return res.status(500).json({ error: 'Failed to delete journey' });
    }

    return res.json({ message: 'Journey deleted' });
  } catch (error) {
    console.error('Error in DELETE /api/journeys/[id]:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
