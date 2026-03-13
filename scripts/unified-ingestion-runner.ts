#!/usr/bin/env npx tsx
/**
 * Unified Data Source Ingestion Runner
 * 
 * Handles all data source types:
 * - Crime (ArcGIS, Socrata, Carto, CKAN)
 * - Health (CDC PLACES)
 * - Demographics (Census ACS)
 * - Boundaries (TIGERweb)
 * - Churches (OSM)
 * 
 * Usage:
 *   npx tsx scripts/unified-ingestion-runner.ts --source-key "crime_las_vegas"
 *   npx tsx scripts/unified-ingestion-runner.ts --source-id "uuid-here"
 *   npx tsx scripts/unified-ingestion-runner.ts --list
 *   npx tsx scripts/unified-ingestion-runner.ts --pending
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { execSync, spawn } from 'child_process';
import * as path from 'path';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface DataSourceConfig {
  id: string;
  source_key: string;
  source_name: string;
  source_type: 'crime' | 'health' | 'demographics' | 'boundaries' | 'churches';
  source_category: string | null;
  enabled: boolean;
  cumulative_mode: boolean;
  endpoint_url: string | null;
  city: string | null;
  state: string | null;
  requires_deduplication: boolean;
  requires_tract_assignment: boolean;
}

interface IngestionRun {
  id: string;
  data_source_id: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  features_fetched: number;
  features_inserted: number;
  features_updated: number;
  features_skipped: number;
  error_message: string | null;
}

async function getSupabase(): Promise<SupabaseClient> {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(supabaseUrl, supabaseKey);
}

async function listDataSources(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase
    .from('data_source_config')
    .select('*')
    .order('source_type', { ascending: true })
    .order('source_name', { ascending: true });

  if (error) {
    console.error('Error fetching data sources:', error.message);
    return;
  }

  console.log('\n📊 Data Sources:\n');
  console.log('Type'.padEnd(15) + 'Name'.padEnd(40) + 'Key'.padEnd(30) + 'Enabled');
  console.log('-'.repeat(100));

  for (const source of data || []) {
    console.log(
      source.source_type.padEnd(15) +
      source.source_name.substring(0, 38).padEnd(40) +
      source.source_key.substring(0, 28).padEnd(30) +
      (source.enabled ? '✓' : '✗')
    );
  }
  console.log(`\nTotal: ${data?.length || 0} sources`);
}

async function getPendingRuns(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase
    .from('ingestion_runs')
    .select(`
      *,
      data_source_config:data_source_id (
        source_name,
        source_key,
        source_type
      )
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching pending runs:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log('\n✅ No pending ingestion runs\n');
    return;
  }

  console.log('\n⏳ Pending Ingestion Runs:\n');
  for (const run of data) {
    console.log(`  ${run.id} - ${run.data_source_config?.source_name || 'Unknown'}`);
  }
  console.log(`\nTotal: ${data.length} pending runs`);
}

async function getDataSourceByKey(supabase: SupabaseClient, key: string): Promise<DataSourceConfig | null> {
  const { data, error } = await supabase
    .from('data_source_config')
    .select('*')
    .eq('source_key', key)
    .single();

  if (error) {
    console.error(`Error fetching data source "${key}":`, error.message);
    return null;
  }
  return data;
}

async function getDataSourceById(supabase: SupabaseClient, id: string): Promise<DataSourceConfig | null> {
  const { data, error } = await supabase
    .from('data_source_config')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error(`Error fetching data source by ID "${id}":`, error.message);
    return null;
  }
  return data;
}

async function createIngestionRun(supabase: SupabaseClient, dataSourceId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('ingestion_runs')
    .insert({
      data_source_id: dataSourceId,
      status: 'running',
      started_at: new Date().toISOString(),
      features_fetched: 0,
      features_inserted: 0,
      features_updated: 0,
      features_skipped: 0,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating ingestion run:', error.message);
    return null;
  }
  return data.id;
}

async function updateIngestionRun(
  supabase: SupabaseClient,
  runId: string,
  updates: Partial<IngestionRun>
): Promise<void> {
  const { error } = await supabase
    .from('ingestion_runs')
    .update(updates)
    .eq('id', runId);

  if (error) {
    console.error('Error updating ingestion run:', error.message);
  }
}

async function updateDataSourceStatus(
  supabase: SupabaseClient,
  sourceId: string,
  status: string,
  recordCount?: number,
  durationMs?: number
): Promise<void> {
  const updates: Record<string, any> = {
    last_run_at: new Date().toISOString(),
    last_run_status: status,
  };
  
  if (recordCount !== undefined) {
    updates.last_run_records = recordCount;
  }
  if (durationMs !== undefined) {
    updates.last_run_duration_ms = durationMs;
  }
  
  if (status === 'success') {
    updates.consecutive_failures = 0;
    updates.last_error_message = null;
  } else if (status === 'failed') {
    const { data } = await supabase
      .from('data_source_config')
      .select('consecutive_failures')
      .eq('id', sourceId)
      .single();
    updates.consecutive_failures = ((data?.consecutive_failures || 0) + 1);
  }

  await supabase
    .from('data_source_config')
    .update(updates)
    .eq('id', sourceId);
}

async function runCrimeIngestion(source: DataSourceConfig): Promise<{ success: boolean; records: number; error?: string }> {
  const cityName = source.city;
  if (!cityName) {
    return { success: false, records: 0, error: 'No city specified for crime source' };
  }

  console.log(`🔄 Running crime ingestion for ${cityName}...`);
  
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'scheduled-crime-ingestion.ts');
    const args = ['--bun-run', scriptPath, cityName];
    
    // Use npx tsx instead of bun for compatibility
    const child = spawn('npx', ['tsx', scriptPath, cityName], {
      stdio: 'inherit',
      env: process.env,
    });

    let recordCount = 0;
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, records: recordCount });
      } else {
        resolve({ success: false, records: 0, error: `Process exited with code ${code}` });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, records: 0, error: err.message });
    });
  });
}

async function runHealthIngestion(source: DataSourceConfig): Promise<{ success: boolean; records: number; error?: string }> {
  console.log(`🔄 Running CDC PLACES health data ingestion...`);
  
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'ingest-cdc-health.ts');
    
    const child = spawn('npx', ['tsx', scriptPath], {
      stdio: 'inherit',
      env: process.env,
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, records: 0 });
      } else {
        resolve({ success: false, records: 0, error: `Process exited with code ${code}` });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, records: 0, error: err.message });
    });
  });
}

async function runDemographicsIngestion(source: DataSourceConfig): Promise<{ success: boolean; records: number; error?: string }> {
  console.log(`🔄 Running Census ACS demographics ingestion...`);
  
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'ingest-census-demographics.ts');
    
    const child = spawn('npx', ['tsx', scriptPath], {
      stdio: 'inherit',
      env: process.env,
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, records: 0 });
      } else {
        resolve({ success: false, records: 0, error: `Process exited with code ${code}` });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, records: 0, error: err.message });
    });
  });
}

async function runBoundariesIngestion(source: DataSourceConfig): Promise<{ success: boolean; records: number; error?: string }> {
  const state = source.state;
  console.log(`🔄 Running TIGERweb boundaries ingestion${state ? ` for ${state}` : ' (national)'}...`);
  
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'ingest-tigerweb-national.ts');
    const args = state ? [scriptPath, state] : [scriptPath];
    
    const child = spawn('npx', ['tsx', ...args], {
      stdio: 'inherit',
      env: process.env,
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, records: 0 });
      } else {
        resolve({ success: false, records: 0, error: `Process exited with code ${code}` });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, records: 0, error: err.message });
    });
  });
}

async function runChurchesIngestion(source: DataSourceConfig): Promise<{ success: boolean; records: number; error?: string }> {
  const state = source.state;
  console.log(`🔄 Running OSM churches ingestion${state ? ` for ${state}` : ' (national)'}...`);
  
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'ingest-osm-national-churches.ts');
    const args = state ? [scriptPath, state] : [scriptPath];
    
    const child = spawn('npx', ['tsx', ...args], {
      stdio: 'inherit',
      env: process.env,
    });
    
    child.on('close', async (code) => {
      if (code === 0) {
        // If deduplication is required, run it
        if (source.requires_deduplication) {
          console.log('🔄 Running church deduplication...');
          const dedupResult = await runChurchDeduplication();
          if (!dedupResult.success) {
            resolve({ success: false, records: 0, error: `Deduplication failed: ${dedupResult.error}` });
            return;
          }
        }
        resolve({ success: true, records: 0 });
      } else {
        resolve({ success: false, records: 0, error: `Process exited with code ${code}` });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, records: 0, error: err.message });
    });
  });
}

async function runChurchDeduplication(): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'dedup-churches.ts');
    
    const child = spawn('npx', ['tsx', scriptPath], {
      stdio: 'inherit',
      env: process.env,
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `Deduplication exited with code ${code}` });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

async function runIngestion(source: DataSourceConfig): Promise<{ success: boolean; records: number; error?: string }> {
  switch (source.source_type) {
    case 'crime':
      return runCrimeIngestion(source);
    case 'health':
      return runHealthIngestion(source);
    case 'demographics':
      return runDemographicsIngestion(source);
    case 'boundaries':
      return runBoundariesIngestion(source);
    case 'churches':
      return runChurchesIngestion(source);
    default:
      return { success: false, records: 0, error: `Unknown source type: ${source.source_type}` };
  }
}

async function executeIngestion(supabase: SupabaseClient, source: DataSourceConfig): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📥 Starting ingestion: ${source.source_name}`);
  console.log(`   Type: ${source.source_type} | Category: ${source.source_category || 'N/A'}`);
  console.log(`   Cumulative Mode: ${source.cumulative_mode ? 'Yes' : 'No'}`);
  console.log(`${'='.repeat(60)}\n`);

  const startTime = Date.now();
  const runId = await createIngestionRun(supabase, source.id);
  
  if (!runId) {
    console.error('❌ Failed to create ingestion run record');
    return;
  }

  try {
    const result = await runIngestion(source);
    const durationMs = Date.now() - startTime;

    if (result.success) {
      await updateIngestionRun(supabase, runId, {
        status: 'success',
        ended_at: new Date().toISOString(),
        duration_ms: durationMs,
        features_fetched: result.records,
        features_inserted: result.records,
      });
      await updateDataSourceStatus(supabase, source.id, 'success', result.records, durationMs);
      console.log(`\n✅ Ingestion completed successfully in ${(durationMs / 1000).toFixed(1)}s`);
    } else {
      await updateIngestionRun(supabase, runId, {
        status: 'failed',
        ended_at: new Date().toISOString(),
        duration_ms: durationMs,
        error_message: result.error || 'Unknown error',
      });
      await updateDataSourceStatus(supabase, source.id, 'failed', 0, durationMs);
      
      await supabase
        .from('data_source_config')
        .update({ last_error_message: result.error })
        .eq('id', source.id);
        
      console.error(`\n❌ Ingestion failed: ${result.error}`);
    }
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    await updateIngestionRun(supabase, runId, {
      status: 'failed',
      ended_at: new Date().toISOString(),
      duration_ms: durationMs,
      error_message: err.message,
    });
    await updateDataSourceStatus(supabase, source.id, 'failed', 0, durationMs);
    await supabase
      .from('data_source_config')
      .update({ last_error_message: err.message })
      .eq('id', source.id);
    console.error(`\n❌ Ingestion error: ${err.message}`);
  }
}

async function processPendingRuns(supabase: SupabaseClient): Promise<void> {
  const { data: pendingRuns, error } = await supabase
    .from('ingestion_runs')
    .select(`
      id,
      data_source_id,
      data_source_config:data_source_id (*)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    console.error('Error fetching pending runs:', error.message);
    return;
  }

  if (!pendingRuns || pendingRuns.length === 0) {
    console.log('No pending runs to process');
    return;
  }

  const run = pendingRuns[0];
  const source = run.data_source_config as unknown as DataSourceConfig;

  if (!source) {
    console.error(`No data source found for run ${run.id}`);
    return;
  }

  // Mark as running
  await supabase
    .from('ingestion_runs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', run.id);

  await executeIngestion(supabase, source);
}

async function main() {
  const args = process.argv.slice(2);
  
  const supabase = await getSupabase();

  if (args.includes('--list')) {
    await listDataSources(supabase);
    return;
  }

  if (args.includes('--pending')) {
    await getPendingRuns(supabase);
    return;
  }

  if (args.includes('--process-pending')) {
    await processPendingRuns(supabase);
    return;
  }

  const sourceKeyIndex = args.indexOf('--source-key');
  if (sourceKeyIndex !== -1 && args[sourceKeyIndex + 1]) {
    const sourceKey = args[sourceKeyIndex + 1];
    const source = await getDataSourceByKey(supabase, sourceKey);
    if (source) {
      await executeIngestion(supabase, source);
    } else {
      console.error(`Data source not found: ${sourceKey}`);
      process.exit(1);
    }
    return;
  }

  const sourceIdIndex = args.indexOf('--source-id');
  if (sourceIdIndex !== -1 && args[sourceIdIndex + 1]) {
    const sourceId = args[sourceIdIndex + 1];
    const source = await getDataSourceById(supabase, sourceId);
    if (source) {
      await executeIngestion(supabase, source);
    } else {
      console.error(`Data source not found with ID: ${sourceId}`);
      process.exit(1);
    }
    return;
  }

  console.log(`
Usage:
  npx tsx scripts/unified-ingestion-runner.ts --list                    # List all data sources
  npx tsx scripts/unified-ingestion-runner.ts --pending                 # Show pending runs
  npx tsx scripts/unified-ingestion-runner.ts --process-pending         # Process next pending run
  npx tsx scripts/unified-ingestion-runner.ts --source-key "crime_xyz"  # Run specific source by key
  npx tsx scripts/unified-ingestion-runner.ts --source-id "uuid"        # Run specific source by ID
`);
}

main().catch(console.error);
