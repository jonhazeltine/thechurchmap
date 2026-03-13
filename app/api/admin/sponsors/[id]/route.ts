import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { updateSponsorSchema } from "@shared/schema";

export async function GET(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const { id } = req.params;

    const { data: sponsor, error } = await adminClient
      .from('sponsors')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !sponsor) {
      return res.status(404).json({ error: 'Sponsor not found' });
    }

    return res.json(sponsor);
  } catch (error) {
    console.error('Error in GET /api/admin/sponsors/:id:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function PATCH(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const { id } = req.params;

    const validationResult = updateSponsorSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const updateData = validationResult.data;

    const cleanedData: Record<string, any> = {};
    for (const [key, value] of Object.entries(updateData)) {
      if (value === '') {
        cleanedData[key] = null;
      } else {
        cleanedData[key] = value;
      }
    }

    const { data: sponsor, error: updateError } = await adminClient
      .from('sponsors')
      .update(cleanedData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating sponsor:', updateError);
      return res.status(500).json({ error: 'Failed to update sponsor' });
    }

    return res.json(sponsor);
  } catch (error) {
    console.error('Error in PATCH /api/admin/sponsors/:id:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function DELETE(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const isSuperAdmin = user.user_metadata?.super_admin === true;
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const { id } = req.params;

    const { error: deleteError } = await adminClient
      .from('sponsors')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting sponsor:', deleteError);
      return res.status(500).json({ error: 'Failed to delete sponsor' });
    }

    return res.status(204).send();
  } catch (error) {
    console.error('Error in DELETE /api/admin/sponsors/:id:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
