import type { Request, Response } from "express";
import { spawn } from "child_process";
import { supabaseServer } from "../../../../../../lib/supabaseServer";

// DEV BYPASS: Set to true to bypass Supabase auth when it's down
const DEV_BYPASS_AUTH = false;

// POST /api/admin/data-sources/:id/trigger - Manually trigger a data source refresh
export async function POST(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    
    // DEV BYPASS: Skip auth check when Supabase is down
    const isDevBypass = DEV_BYPASS_AUTH && token === "dev-bypass-token";
    let userId = "dev-bypass-user";
    
    if (!isDevBypass) {
      const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
      
      if (authError || !user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const isSuperAdmin = user.user_metadata?.super_admin === true;
      if (!isSuperAdmin) {
        return res.status(403).json({ error: 'Super admin access required' });
      }
      userId = user.id;
    } else {
      console.log("🔓 DEV BYPASS: Granting super admin access to trigger data source");
    }

    const dataSourceId = req.params.id;
    if (!dataSourceId) {
      return res.status(400).json({ error: 'Data source ID required' });
    }

    const { data: dataSource, error: fetchError } = await adminClient
      .from('data_source_config')
      .select('*')
      .eq('id', dataSourceId)
      .single();

    if (fetchError || !dataSource) {
      return res.status(404).json({ error: 'Data source not found' });
    }

    const { data: existingRun } = await adminClient
      .from('ingestion_runs')
      .select('id')
      .eq('data_source_id', dataSourceId)
      .eq('status', 'running')
      .single();

    if (existingRun) {
      return res.status(409).json({ 
        error: 'An ingestion run is already in progress for this data source' 
      });
    }

    const { data: ingestionRun, error: insertError } = await adminClient
      .from('ingestion_runs')
      .insert([{
        data_source_id: dataSourceId,
        dataset: dataSource.source_key,
        state: dataSource.state,
        city: dataSource.city,
        status: 'pending',
        features_fetched: 0,
        features_inserted: 0,
        features_updated: 0,
        features_skipped: 0,
        metadata: { 
          triggered_by: userId,
          triggered_manually: true
        }
      }])
      .select()
      .single();

    if (insertError) {
      console.error('Error creating ingestion run:', insertError);
      return res.status(500).json({ error: 'Failed to trigger data source refresh' });
    }

    await adminClient
      .from('data_source_config')
      .update({
        last_run_status: 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', dataSourceId);

    // Spawn the ingestion runner as a background process (non-blocking)
    try {
      const ingestionProcess = spawn('npx', ['tsx', 'scripts/run-ingestion.ts', '--id', dataSourceId], {
        detached: true,
        stdio: 'ignore',
        cwd: process.cwd(),
        env: {
          ...process.env,
          INGESTION_RUN_ID: ingestionRun.id
        }
      });

      // Unref allows the parent process to exit independently of the child
      ingestionProcess.unref();

      console.log(`🚀 Spawned ingestion runner for ${dataSource.source_name} (PID: ${ingestionProcess.pid})`);
    } catch (spawnError) {
      console.error('Failed to spawn ingestion runner:', spawnError);
      // Update ingestion run to failed
      await adminClient
        .from('ingestion_runs')
        .update({
          status: 'failed',
          error_message: `Failed to spawn ingestion runner: ${spawnError}`,
          completed_at: new Date().toISOString()
        })
        .eq('id', ingestionRun.id);
      
      await adminClient
        .from('data_source_config')
        .update({
          last_run_status: 'failed',
          consecutive_failures: (dataSource.consecutive_failures || 0) + 1
        })
        .eq('id', dataSourceId);

      return res.status(500).json({ error: 'Failed to start ingestion process' });
    }

    return res.status(201).json({
      message: 'Data source refresh triggered successfully',
      ingestion_run: ingestionRun,
      data_source: {
        id: dataSource.id,
        source_key: dataSource.source_key,
        source_name: dataSource.source_name
      }
    });

  } catch (error) {
    console.error('Error in trigger data source:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
