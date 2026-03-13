import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../lib/supabaseServer";
import { updateMissionFundingSubmissionSchema } from "@shared/schema";

export async function GET(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const userClient = supabaseUserClient(token);
    const { data: { user } } = await userClient.auth.getUser();
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const adminClient = supabaseServer();

    const { data: adminRole } = await adminClient
      .from('city_platform_users')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['super_admin', 'platform_owner', 'platform_admin'])
      .eq('is_active', true)
      .single();

    if (!adminRole) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { status, church_id, limit = '50', offset = '0' } = req.query;

    let query = adminClient
      .from('mission_funding_submissions')
      .select(`
        *,
        church:churches(id, name, city, state)
      `)
      .order('created_at', { ascending: false })
      .range(parseInt(offset as string), parseInt(offset as string) + parseInt(limit as string) - 1);

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (church_id) {
      query = query.eq('church_id', church_id);
    }

    const { data: submissions, error } = await query;

    if (error) {
      console.error('Error fetching submissions:', error);
      return res.status(500).json({ error: 'Failed to fetch submissions' });
    }

    const { count } = await adminClient
      .from('mission_funding_submissions')
      .select('*', { count: 'exact', head: true });

    return res.json({
      submissions: submissions || [],
      total: count || 0
    });
  } catch (error) {
    console.error('Error in GET /api/admin/mission-funding-submissions:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function PATCH(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const userClient = supabaseUserClient(token);
    const { data: { user } } = await userClient.auth.getUser();
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const adminClient = supabaseServer();

    const { data: adminRole } = await adminClient
      .from('city_platform_users')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['super_admin', 'platform_owner', 'platform_admin'])
      .eq('is_active', true)
      .single();

    if (!adminRole) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: 'Submission ID required' });
    }

    const validationResult = updateMissionFundingSubmissionSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const { data: submission, error } = await adminClient
      .from('mission_funding_submissions')
      .update({
        status: validationResult.data.status,
        admin_notes: validationResult.data.admin_notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating submission:', error);
      return res.status(500).json({ error: 'Failed to update submission' });
    }

    return res.json({ submission });
  } catch (error) {
    console.error('Error in PATCH /api/admin/mission-funding-submissions:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
