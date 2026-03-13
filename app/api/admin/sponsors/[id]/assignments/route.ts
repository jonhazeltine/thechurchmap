import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";
import { insertSponsorAssignmentSchema } from "@shared/schema";

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

    const { data: assignments, error } = await adminClient
      .from('sponsor_assignments')
      .select(`
        *,
        church:church_id (
          id,
          name,
          city,
          state
        ),
        platform:city_platform_id (
          id,
          name
        )
      `)
      .eq('sponsor_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching assignments:', error);
      return res.status(500).json({ error: 'Failed to fetch assignments' });
    }

    return res.json(assignments || []);
  } catch (error) {
    console.error('Error in GET /api/admin/sponsors/:id/assignments:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function POST(req: Request, res: Response) {
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

    const validationResult = insertSponsorAssignmentSchema.safeParse({
      ...req.body,
      sponsor_id: id,
    });
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const assignmentData = validationResult.data;

    if (!assignmentData.church_id && !assignmentData.city_platform_id) {
      return res.status(400).json({
        error: 'Either church_id or city_platform_id must be provided'
      });
    }

    const { data: assignment, error: insertError } = await adminClient
      .from('sponsor_assignments')
      .insert({
        sponsor_id: id,
        church_id: assignmentData.church_id || null,
        city_platform_id: assignmentData.city_platform_id || null,
        display_from: assignmentData.display_from || new Date().toISOString(),
        display_to: assignmentData.display_to || null,
        is_active: assignmentData.is_active,
      })
      .select(`
        *,
        church:church_id (
          id,
          name,
          city,
          state
        ),
        platform:city_platform_id (
          id,
          name
        )
      `)
      .single();

    if (insertError) {
      console.error('Error creating assignment:', insertError);
      return res.status(500).json({ error: 'Failed to create assignment' });
    }

    return res.status(201).json(assignment);
  } catch (error) {
    console.error('Error in POST /api/admin/sponsors/:id/assignments:', error);
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
    const { assignment_id } = req.query;

    if (!assignment_id) {
      return res.status(400).json({ error: 'assignment_id query parameter is required' });
    }

    const { error: deleteError } = await adminClient
      .from('sponsor_assignments')
      .delete()
      .eq('id', assignment_id)
      .eq('sponsor_id', id);

    if (deleteError) {
      console.error('Error deleting assignment:', deleteError);
      return res.status(500).json({ error: 'Failed to delete assignment' });
    }

    return res.status(204).send();
  } catch (error) {
    console.error('Error in DELETE /api/admin/sponsors/:id/assignments:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
