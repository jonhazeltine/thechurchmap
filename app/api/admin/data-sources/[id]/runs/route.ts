import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";

// GET /api/admin/data-sources/:id/runs - Get ingestion run history for a data source
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

    const dataSourceId = req.params.id;
    if (!dataSourceId) {
      return res.status(400).json({ error: 'Data source ID required' });
    }

    const { data: dataSource } = await adminClient
      .from('data_source_config')
      .select('id, source_key, source_name')
      .eq('id', dataSourceId)
      .single();

    if (!dataSource) {
      return res.status(404).json({ error: 'Data source not found' });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;

    let query = adminClient
      .from('ingestion_runs')
      .select('*', { count: 'exact' })
      .eq('data_source_id', dataSourceId)
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && ['success', 'failed', 'running', 'pending'].includes(status)) {
      query = query.eq('status', status);
    }

    const { data: runs, count, error } = await query;

    if (error) {
      console.error('Error fetching ingestion runs:', error);
      return res.status(500).json({ error: 'Failed to fetch ingestion runs' });
    }

    return res.status(200).json({
      data_source: dataSource,
      runs: runs || [],
      total: count || 0,
      limit,
      offset
    });

  } catch (error) {
    console.error('Error in get ingestion runs:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
