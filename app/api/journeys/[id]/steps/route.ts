import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { insertPrayerJourneyStepSchema } from "../../../../../shared/schema";

// GET /api/journeys/:id/steps - Get ordered steps
export async function GET(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const adminClient = supabaseServer();

    const { data: steps, error } = await adminClient
      .from('prayer_journey_steps')
      .select('*')
      .eq('journey_id', id)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Error fetching steps:', error);
      return res.status(500).json({ error: 'Failed to fetch steps' });
    }

    return res.json(steps || []);
  } catch (error) {
    console.error('Error in GET /api/journeys/[id]/steps:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// POST /api/journeys/:id/steps - Add step(s)
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

    // Verify journey ownership
    const { data: journey } = await adminClient
      .from('prayer_journeys')
      .select('created_by_user_id')
      .eq('id', id)
      .single();

    if (!journey || journey.created_by_user_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Support both single step and array of steps
    const stepsInput = Array.isArray(req.body) ? req.body : [req.body];
    const validatedSteps = [];

    for (const step of stepsInput) {
      const result = insertPrayerJourneyStepSchema.safeParse(step);
      if (!result.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: result.error.errors,
        });
      }
      validatedSteps.push({ ...result.data, journey_id: id });
    }

    const { data: inserted, error } = await adminClient
      .from('prayer_journey_steps')
      .insert(validatedSteps)
      .select();

    if (error) {
      console.error('Error inserting steps:', error);
      return res.status(500).json({ error: 'Failed to add steps' });
    }

    return res.status(201).json(inserted);
  } catch (error) {
    console.error('Error in POST /api/journeys/[id]/steps:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
