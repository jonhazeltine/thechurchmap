import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import type { DataSourceType, DataSourceDashboard } from "../../../../../shared/schema";

// DEV BYPASS: Set to true to bypass Supabase auth when it's down
const DEV_BYPASS_AUTH = false;

// GET /api/admin/data-sources/dashboard - Get dashboard stats for data sources
export async function GET(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    
    // DEV BYPASS: Skip auth check when Supabase is down
    const isDevBypass = DEV_BYPASS_AUTH && token === "dev-bypass-token";
    
    if (!isDevBypass) {
      const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
      
      if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const isSuperAdmin = user.user_metadata?.super_admin === true;
      if (!isSuperAdmin) {
        return res.status(403).json({ error: 'Super admin access required' });
      }
    } else {
      console.log("🔓 DEV BYPASS: Granting super admin access to data sources dashboard");
    }

    const { data: allSources, error: sourcesError } = await adminClient
      .from('data_source_config')
      .select('*');

    if (sourcesError) {
      console.error('Error fetching data sources:', sourcesError);
      return res.status(500).json({ error: 'Failed to fetch data sources' });
    }

    const sources = allSources || [];
    const totalSources = sources.length;
    const enabledSources = sources.filter(s => s.enabled).length;

    const sourceTypes: DataSourceType[] = ['crime', 'health', 'demographics', 'boundaries', 'churches'];
    const sourcesByType: Record<DataSourceType, number> = {
      crime: 0,
      health: 0,
      demographics: 0,
      boundaries: 0,
      churches: 0
    };
    
    for (const source of sources) {
      if (source.source_type && sourceTypes.includes(source.source_type as DataSourceType)) {
        sourcesByType[source.source_type as DataSourceType]++;
      }
    }

    const { data: recentRuns, error: runsError } = await adminClient
      .from('ingestion_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(10);

    if (runsError) {
      console.error('Error fetching recent runs:', runsError);
    }

    const nextScheduled = sources
      .filter(s => s.enabled && s.next_run_at)
      .sort((a, b) => {
        if (!a.next_run_at) return 1;
        if (!b.next_run_at) return -1;
        return new Date(a.next_run_at).getTime() - new Date(b.next_run_at).getTime();
      })
      .slice(0, 5);

    const failingSources = sources.filter(s => 
      s.last_run_status === 'failed' || s.consecutive_failures > 0
    ).sort((a, b) => b.consecutive_failures - a.consecutive_failures);

    const dashboard: DataSourceDashboard = {
      total_sources: totalSources,
      enabled_sources: enabledSources,
      sources_by_type: sourcesByType,
      recent_runs: recentRuns || [],
      next_scheduled: nextScheduled,
      failing_sources: failingSources
    };

    return res.status(200).json(dashboard);

  } catch (error) {
    console.error('Error in data sources dashboard:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
