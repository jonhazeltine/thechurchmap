#!/usr/bin/env npx tsx
/**
 * Ingestion Runner Script
 * 
 * Runs ingestion for a specific data source by ID.
 * Looks up configuration from Supabase, runs the appropriate ingestion logic,
 * and updates the ingestion_runs and data_source_config tables.
 * 
 * Usage:
 *   npx tsx scripts/run-ingestion.ts --id <uuid>
 *   npx tsx scripts/run-ingestion.ts --id <uuid> --dry-run
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ARCGIS_ENDPOINTS,
  SOCRATA_ENDPOINTS,
  CARTO_ENDPOINTS,
  CKAN_ENDPOINTS,
  ArcGISEndpoint,
  SocrataEndpoint,
  CartoEndpoint,
  CKANEndpoint,
  normalizeOffenseType,
  CrimeMetricKey,
} from './config/crime-sources';

const BATCH_SIZE = 1000;

interface DataSourceConfig {
  id: string;
  source_key: string;
  source_name: string;
  source_type: 'crime' | 'health' | 'demographics' | 'boundaries' | 'churches';
  source_category: 'arcgis' | 'socrata' | 'carto' | 'ckan' | 'api' | 'osm' | 'tigerweb' | 'cdc' | 'census' | null;
  enabled: boolean;
  cumulative_mode: boolean;
  endpoint_url: string | null;
  city: string | null;
  state: string | null;
}

interface IngestionCounts {
  features_fetched: number;
  features_inserted: number;
  features_updated: number;
  features_skipped: number;
}

interface CrimeIncident {
  city: string;
  state: string;
  incident_date: Date | null;
  offense_type: string;
  normalized_type: CrimeMetricKey | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  case_number: string | null;
  source: string;
  raw_data: Record<string, any>;
}

function sanitizeForJson(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    return obj
      .replace(/[\x00-\x1F\x7F]/g, '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForJson);
  }
  if (typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeForJson(value);
    }
    return result;
  }
  return obj;
}

async function getSupabase(): Promise<SupabaseClient> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(supabaseUrl, supabaseKey);
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

async function findPendingRun(supabase: SupabaseClient, dataSourceId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('ingestion_runs')
    .select('id')
    .eq('data_source_id', dataSourceId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error finding pending run:', error.message);
  }
  return data?.id || null;
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

async function updateRunToRunning(supabase: SupabaseClient, runId: string): Promise<void> {
  const { error } = await supabase
    .from('ingestion_runs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (error) {
    console.error('Error updating run to running:', error.message);
  }
}

async function updateIngestionRun(
  supabase: SupabaseClient,
  runId: string,
  status: 'success' | 'failed',
  counts: IngestionCounts,
  errorMessage?: string
): Promise<void> {
  const { error } = await supabase
    .from('ingestion_runs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      features_fetched: counts.features_fetched,
      features_inserted: counts.features_inserted,
      features_updated: counts.features_updated,
      features_skipped: counts.features_skipped,
      error_message: errorMessage || null,
    })
    .eq('id', runId);

  if (error) {
    console.error('Error updating ingestion run:', error.message);
  }
}

async function updateDataSourceConfig(
  supabase: SupabaseClient,
  sourceId: string,
  status: 'success' | 'failed',
  durationMs: number,
  recordCount: number,
  errorMessage?: string
): Promise<void> {
  const updates: Record<string, any> = {
    last_run_at: new Date().toISOString(),
    last_run_status: status,
    last_run_duration_ms: durationMs,
    record_count: recordCount,
  };

  if (status === 'success') {
    updates.consecutive_failures = 0;
    updates.last_error_message = null;
  } else {
    const { data } = await supabase
      .from('data_source_config')
      .select('consecutive_failures')
      .eq('id', sourceId)
      .single();
    updates.consecutive_failures = ((data?.consecutive_failures || 0) + 1);
    updates.last_error_message = errorMessage || null;
  }

  const { error } = await supabase
    .from('data_source_config')
    .update(updates)
    .eq('id', sourceId);

  if (error) {
    console.error('Error updating data source config:', error.message);
  }
}

async function getRecordCount(supabase: SupabaseClient, city: string, state: string): Promise<number> {
  const { count, error } = await supabase
    .from('crime_incidents')
    .select('*', { count: 'exact', head: true })
    .eq('city', city)
    .eq('state', state);

  if (error) {
    console.error('Error getting record count:', error.message);
    return 0;
  }
  return count || 0;
}

async function clearCityData(
  supabase: SupabaseClient,
  cityName: string,
  stateName: string,
  dryRun: boolean
): Promise<number> {
  if (dryRun) {
    const { count } = await supabase
      .from('crime_incidents')
      .select('*', { count: 'exact', head: true })
      .eq('city', cityName)
      .eq('state', stateName);

    console.log(`[DRY RUN] Would delete ${count || 0} existing records for ${cityName}, ${stateName}`);
    return count || 0;
  }

  const { error, count } = await supabase
    .from('crime_incidents')
    .delete({ count: 'exact' })
    .eq('city', cityName)
    .eq('state', stateName);

  if (error) {
    console.error(`  Error clearing old data: ${error.message}`);
    return 0;
  }

  console.log(`  Cleared ${count || 0} existing records for ${cityName}`);
  return count || 0;
}

function buildDeduplicationKey(rec: { case_number: string | null; incident_date: string | null; address?: string | null; latitude?: number | null; longitude?: number | null }): string | null {
  // Only dedupe if we have a reliable unique identifier
  // Case number is the primary identifier, but must not be null
  if (!rec.case_number) {
    // Without a case number, we can't reliably dedupe - each record is unique
    return null;
  }
  
  const dateStr = rec.incident_date ? rec.incident_date.substring(0, 10) : '';
  // Use case_number + date as the key (case_number is required and unique per incident)
  return `${rec.case_number}|${dateStr}`;
}

async function upsertIncidents(
  supabase: SupabaseClient,
  incidents: CrimeIncident[],
  dryRun: boolean,
  cumulativeMode: boolean = false
): Promise<{ inserted: number; skipped: number; errors: number }> {
  if (dryRun) {
    console.log(`[DRY RUN] Would process ${incidents.length} incidents`);
    return { inserted: incidents.length, skipped: 0, errors: 0 };
  }

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  // For cumulative mode, we need to check for existing records
  // Build a set of existing case_number+date keys for the city/state
  // Only records WITH case_numbers can be deduped - null case_numbers are always inserted
  const existingKeys = new Set<string>();
  
  if (cumulativeMode && incidents.length > 0) {
    const city = incidents[0].city;
    const state = incidents[0].state;
    
    console.log(`  Cumulative mode: Checking for existing records in ${city}, ${state}...`);
    
    // Only fetch records that have a case_number (dedupable records)
    const { data: existing, error: fetchError } = await supabase
      .from('crime_incidents')
      .select('case_number, incident_date')
      .eq('city', city)
      .eq('state', state)
      .not('case_number', 'is', null);
    
    if (fetchError) {
      console.error(`  Error fetching existing records: ${fetchError.message}`);
    } else if (existing) {
      for (const rec of existing) {
        const key = buildDeduplicationKey(rec);
        if (key) existingKeys.add(key);
      }
      console.log(`  Found ${existingKeys.size} dedupable records in database (with case_number)`);
    }
  }

  for (let i = 0; i < incidents.length; i += BATCH_SIZE) {
    const batch = incidents.slice(i, i + BATCH_SIZE);
    
    // Filter out duplicates in cumulative mode
    // Note: Records without case_numbers are ALWAYS inserted (can't dedupe without identifier)
    const toInsert = cumulativeMode 
      ? batch.filter(inc => {
          const key = buildDeduplicationKey({
            case_number: inc.case_number,
            incident_date: inc.incident_date?.toISOString() || null
          });
          
          // No key means no case_number - always insert these records
          if (!key) {
            return true;
          }
          
          if (existingKeys.has(key)) {
            return false; // Skip this record - already exists
          }
          // Add to set so we don't insert duplicates within this batch
          existingKeys.add(key);
          return true;
        })
      : batch;
    
    const batchSkipped = batch.length - toInsert.length;
    skipped += batchSkipped;
    
    if (toInsert.length === 0) {
      continue;
    }

    const records = toInsert.map(inc => ({
      city: inc.city,
      state: inc.state,
      incident_date: inc.incident_date?.toISOString() || null,
      offense_type: inc.offense_type,
      normalized_type: inc.normalized_type,
      address: inc.address,
      location: inc.latitude && inc.longitude
        ? `SRID=4326;POINT(${inc.longitude} ${inc.latitude})`
        : null,
      case_number: inc.case_number,
      source: inc.source,
      raw_data: sanitizeForJson(inc.raw_data),
    }));

    // Split records: those with case_number can use upsert, others use insert
    const recordsWithCaseNumber = records.filter(r => r.case_number);
    const recordsWithoutCaseNumber = records.filter(r => !r.case_number);

    // Use upsert for records with case_number (database-level deduplication)
    if (recordsWithCaseNumber.length > 0) {
      const { error: upsertError } = await supabase
        .from('crime_incidents')
        .upsert(recordsWithCaseNumber as any, {
          onConflict: 'source,case_number',
          ignoreDuplicates: true,
        });

      if (upsertError) {
        console.error(`  Error upserting batch at ${i}: ${upsertError.message}`);
        errors += recordsWithCaseNumber.length;
      } else {
        inserted += recordsWithCaseNumber.length;
      }
    }

    // Use insert for records without case_number (can't dedupe without identifier)
    if (recordsWithoutCaseNumber.length > 0) {
      const { error: insertError } = await supabase
        .from('crime_incidents')
        .insert(recordsWithoutCaseNumber as any);

      if (insertError) {
        console.error(`  Error inserting batch at ${i}: ${insertError.message}`);
        errors += recordsWithoutCaseNumber.length;
      } else {
        inserted += recordsWithoutCaseNumber.length;
      }
    }

    if ((i + BATCH_SIZE) % 5000 === 0 || i + BATCH_SIZE >= incidents.length) {
      const processedCount = Math.min(i + BATCH_SIZE, incidents.length);
      console.log(`  Processed ${processedCount}/${incidents.length} (inserted: ${inserted}, skipped: ${skipped})`);
    }
  }

  return { inserted, skipped, errors };
}

async function fetchArcGISData(endpoint: ArcGISEndpoint): Promise<CrimeIncident[]> {
  const PAGE_SIZE = 2000;
  const RATE_LIMIT_MS = 100;
  const allIncidents: CrimeIncident[] = [];
  let offset = 0;
  let hasMore = true;

  console.log(`Fetching from ${endpoint.name}, ${endpoint.state}...`);
  console.log(`  URL: ${endpoint.serviceUrl}/${endpoint.layerId}`);

  const countUrl = `${endpoint.serviceUrl}/${endpoint.layerId}/query`;
  const countParams = new URLSearchParams({ where: '1=1', returnCountOnly: 'true', f: 'json' });
  let totalCount = 0;
  try {
    const countResponse = await fetch(`${countUrl}?${countParams}`);
    const countData = await countResponse.json();
    totalCount = countData.count || 0;
    if (totalCount > 0) console.log(`  Expected total: ${totalCount.toLocaleString()} records`);
  } catch {}

  while (hasMore) {
    try {
      const url = `${endpoint.serviceUrl}/${endpoint.layerId}/query`;
      const params = new URLSearchParams({
        where: '1=1',
        outFields: '*',
        returnGeometry: 'true',
        f: 'json',
        resultOffset: offset.toString(),
        resultRecordCount: PAGE_SIZE.toString(),
      });

      const response = await fetch(`${url}?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);

      const features = data.features || [];
      if (features.length === 0) {
        hasMore = false;
        continue;
      }

      for (const feature of features) {
        const attrs = feature.attributes || {};
        const geom = feature.geometry;
        const mappings = endpoint.fieldMappings;

        const offenseType = attrs[mappings.offenseType];
        if (!offenseType) continue;

        let incidentDate: Date | null = null;
        const dateValue = attrs[mappings.date];
        if (dateValue) {
          incidentDate = new Date(typeof dateValue === 'number' ? dateValue : dateValue);
          if (isNaN(incidentDate.getTime())) incidentDate = null;
        }

        let lat = mappings.latitude ? parseFloat(attrs[mappings.latitude]) || null : geom?.y || null;
        let lon = mappings.longitude ? parseFloat(attrs[mappings.longitude]) || null : geom?.x || null;
        if (lat === 0) lat = null;
        if (lon === 0) lon = null;

        let normalizedType: CrimeMetricKey | null = null;
        if (endpoint.offenseTypeMapping && endpoint.offenseTypeMapping[offenseType]) {
          normalizedType = endpoint.offenseTypeMapping[offenseType] as CrimeMetricKey;
        } else {
          normalizedType = normalizeOffenseType(offenseType);
        }

        allIncidents.push({
          city: endpoint.name,
          state: endpoint.state,
          incident_date: incidentDate,
          offense_type: offenseType,
          normalized_type: normalizedType,
          latitude: lat,
          longitude: lon,
          address: mappings.address ? attrs[mappings.address] || null : null,
          case_number: mappings.caseNumber ? attrs[mappings.caseNumber] || null : null,
          source: `arcgis_${endpoint.name.toLowerCase().replace(/\s+/g, '_')}`,
          raw_data: attrs,
        });
      }

      console.log(`  Fetched ${offset + features.length} records (${allIncidents.length} parsed)...`);
      offset += features.length;

      if (totalCount > 0) {
        hasMore = offset < totalCount;
      } else if (features.length < PAGE_SIZE) {
        hasMore = false;
      }

      if (hasMore) await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    } catch (error) {
      console.error(`  Error at offset ${offset}:`, error);
      break;
    }
  }

  console.log(`  Total incidents: ${allIncidents.length}`);
  return allIncidents;
}

async function fetchSocrataData(endpoint: SocrataEndpoint): Promise<CrimeIncident[]> {
  const PAGE_SIZE = 50000;
  const RATE_LIMIT_MS = 200;
  const allIncidents: CrimeIncident[] = [];
  let offset = 0;
  let hasMore = true;

  console.log(`Fetching from ${endpoint.name}, ${endpoint.state}...`);
  console.log(`  Domain: ${endpoint.domain}`);
  console.log(`  Dataset: ${endpoint.datasetId}`);

  while (hasMore) {
    const baseUrl = `https://${endpoint.domain}/resource/${endpoint.datasetId}.json`;
    const params = new URLSearchParams({
      '$limit': PAGE_SIZE.toString(),
      '$offset': offset.toString(),
      '$order': `${endpoint.fieldMappings.date} DESC`,
    });

    try {
      const response = await fetch(`${baseUrl}?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const records = await response.json();
      if (!Array.isArray(records) || records.length === 0) {
        hasMore = false;
        continue;
      }

      for (const record of records) {
        const mappings = endpoint.fieldMappings;
        const offenseType = record[mappings.offenseType];
        if (!offenseType) continue;

        let incidentDate: Date | null = null;
        const dateValue = record[mappings.date];
        if (dateValue) {
          incidentDate = new Date(dateValue);
          if (isNaN(incidentDate.getTime())) incidentDate = null;
        }

        let lat: number | null = null;
        let lon: number | null = null;
        if (mappings.latitude && mappings.longitude) {
          const getNestedValue = (obj: any, path: string) => path.split('.').reduce((c, k) => c?.[k], obj);
          lat = parseFloat(getNestedValue(record, mappings.latitude)) || null;
          lon = parseFloat(getNestedValue(record, mappings.longitude)) || null;
        }
        if (lat === 0) lat = null;
        if (lon === 0) lon = null;

        allIncidents.push({
          city: endpoint.name,
          state: endpoint.state,
          incident_date: incidentDate,
          offense_type: offenseType,
          normalized_type: normalizeOffenseType(offenseType),
          latitude: lat,
          longitude: lon,
          address: mappings.address ? record[mappings.address] || null : null,
          case_number: mappings.caseNumber ? record[mappings.caseNumber] || null : null,
          source: `socrata_${endpoint.name.toLowerCase().replace(/\s+/g, '_')}`,
          raw_data: record,
        });
      }

      console.log(`  Fetched ${offset + records.length} records (${allIncidents.length} parsed)...`);

      if (records.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += records.length;
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
      }
    } catch (error) {
      console.error(`  Error at offset ${offset}:`, error);
      break;
    }
  }

  console.log(`  Total incidents: ${allIncidents.length}`);
  return allIncidents;
}

async function fetchCartoData(endpoint: CartoEndpoint): Promise<CrimeIncident[]> {
  const PAGE_SIZE = 50000;
  const RATE_LIMIT_MS = 500;
  const allIncidents: CrimeIncident[] = [];
  let offset = 0;
  let hasMore = true;

  console.log(`Fetching from ${endpoint.name}, ${endpoint.state}...`);
  console.log(`  Base URL: ${endpoint.baseUrl}`);
  console.log(`  Table: ${endpoint.tableName}`);

  while (hasMore) {
    const sql = `SELECT * FROM ${endpoint.tableName} WHERE 1=1 ORDER BY ${endpoint.fieldMappings.date} DESC LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
    const params = new URLSearchParams({ 'q': sql, 'format': 'json' });
    const url = `${endpoint.baseUrl}?${params}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const records = data.rows || [];
      if (!Array.isArray(records) || records.length === 0) {
        hasMore = false;
        continue;
      }

      for (const record of records) {
        const mappings = endpoint.fieldMappings;
        const offenseType = record[mappings.offenseType];
        if (!offenseType) continue;

        let incidentDate: Date | null = null;
        const dateValue = record[mappings.date];
        if (dateValue) {
          incidentDate = new Date(dateValue);
          if (isNaN(incidentDate.getTime())) incidentDate = null;
        }

        let lat: number | null = null;
        let lon: number | null = null;
        if (mappings.latitude && mappings.longitude) {
          lat = parseFloat(record[mappings.latitude]) || null;
          lon = parseFloat(record[mappings.longitude]) || null;
        }
        if (lat === 0) lat = null;
        if (lon === 0) lon = null;

        const caseNumber = mappings.caseNumber ? record[mappings.caseNumber] : null;
        const uniqueId = caseNumber || `${record.cartodb_id || ''}_${dateValue || ''}`;

        allIncidents.push({
          city: endpoint.name,
          state: endpoint.state,
          incident_date: incidentDate,
          offense_type: offenseType,
          normalized_type: normalizeOffenseType(offenseType),
          latitude: lat,
          longitude: lon,
          address: mappings.address ? record[mappings.address] || null : null,
          case_number: uniqueId,
          source: `carto_${endpoint.name.toLowerCase().replace(/\s+/g, '_')}`,
          raw_data: record,
        });
      }

      console.log(`  Fetched ${offset + records.length} records (${allIncidents.length} parsed)...`);

      if (records.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += records.length;
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
      }
    } catch (error) {
      console.error(`  Error at offset ${offset}:`, error);
      break;
    }
  }

  console.log(`  Total incidents: ${allIncidents.length}`);
  return allIncidents;
}

const MILWAUKEE_OFFENSE_MAPPING: Record<string, CrimeMetricKey> = {
  'AssaultOffense': 'assault_rate',
  'Arson': 'vandalism_rate',
  'Burglary': 'burglary_rate',
  'CriminalDamage': 'vandalism_rate',
  'Homicide': 'assault_rate',
  'Robbery': 'robbery_rate',
  'SexOffense': 'sex_offense_rate',
  'Theft': 'theft_rate',
  'VehicleTheft': 'vehicle_theft_rate',
  'LockedVehicle': 'theft_rate',
};

async function fetchCKANData(endpoint: CKANEndpoint): Promise<CrimeIncident[]> {
  const PAGE_SIZE = 10000;
  const RATE_LIMIT_MS = 200;
  const allIncidents: CrimeIncident[] = [];
  let offset = 0;
  let hasMore = true;

  console.log(`Fetching from ${endpoint.name}, ${endpoint.state}...`);
  console.log(`  Domain: ${endpoint.domain}`);
  console.log(`  Resource ID: ${endpoint.resourceId}`);

  while (hasMore) {
    const baseUrl = `https://${endpoint.domain}/api/3/action/datastore_search`;
    const params = new URLSearchParams({
      'resource_id': endpoint.resourceId,
      'limit': PAGE_SIZE.toString(),
      'offset': offset.toString(),
    });

    try {
      const response = await fetch(`${baseUrl}?${params}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (!data.success) throw new Error(data.error?.message || 'API error');

      const records = data.result?.records || [];
      if (!Array.isArray(records) || records.length === 0) {
        hasMore = false;
        continue;
      }

      for (const record of records) {
        const mappings = endpoint.fieldMappings;

        if (endpoint.name === 'Milwaukee') {
          let incidentDate: Date | null = null;
          const dateValue = record[mappings.date];
          if (dateValue) {
            incidentDate = new Date(dateValue);
            if (isNaN(incidentDate.getTime())) incidentDate = null;
          }

          let lat: number | null = null;
          let lon: number | null = null;
          if (mappings.latitude && mappings.longitude) {
            lat = parseFloat(record[mappings.latitude]) || null;
            lon = parseFloat(record[mappings.longitude]) || null;
          }
          if (lat === 0) lat = null;
          if (lon === 0) lon = null;

          for (const [field, normalizedType] of Object.entries(MILWAUKEE_OFFENSE_MAPPING)) {
            if (record[field] === '1' || record[field] === 1) {
              allIncidents.push({
                city: endpoint.name,
                state: endpoint.state,
                incident_date: incidentDate,
                offense_type: field,
                normalized_type: normalizedType,
                latitude: lat,
                longitude: lon,
                address: mappings.address ? record[mappings.address] || null : null,
                case_number: mappings.caseNumber ? record[mappings.caseNumber] || null : null,
                source: `ckan_${endpoint.name.toLowerCase().replace(/\s+/g, '_')}`,
                raw_data: record,
              });
            }
          }
        } else {
          const offenseType = record[mappings.offenseType];
          if (!offenseType) continue;

          let incidentDate: Date | null = null;
          const dateValue = record[mappings.date];
          if (dateValue) {
            incidentDate = new Date(dateValue);
            if (isNaN(incidentDate.getTime())) incidentDate = null;
          }

          let lat: number | null = null;
          let lon: number | null = null;
          if (mappings.latitude && mappings.longitude) {
            lat = parseFloat(record[mappings.latitude]) || null;
            lon = parseFloat(record[mappings.longitude]) || null;
          }
          if (lat === 0) lat = null;
          if (lon === 0) lon = null;

          allIncidents.push({
            city: endpoint.name,
            state: endpoint.state,
            incident_date: incidentDate,
            offense_type: offenseType,
            normalized_type: normalizeOffenseType(offenseType),
            latitude: lat,
            longitude: lon,
            address: mappings.address ? record[mappings.address] || null : null,
            case_number: mappings.caseNumber ? record[mappings.caseNumber] || null : null,
            source: `ckan_${endpoint.name.toLowerCase().replace(/\s+/g, '_')}`,
            raw_data: record,
          });
        }
      }

      console.log(`  Fetched ${offset + records.length} records (${allIncidents.length} parsed)...`);

      const total = data.result?.total;
      if (total && offset + records.length >= total) {
        hasMore = false;
      } else if (records.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += records.length;
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
      }
    } catch (error) {
      console.error(`  Error at offset ${offset}:`, error);
      break;
    }
  }

  console.log(`  Total incidents: ${allIncidents.length}`);
  return allIncidents;
}

function findEndpoint(
  category: string,
  cityName: string | null,
  stateName: string | null
): ArcGISEndpoint | SocrataEndpoint | CartoEndpoint | CKANEndpoint | null {
  if (!cityName) return null;

  const cityLower = cityName.toLowerCase();

  switch (category) {
    case 'arcgis':
      return ARCGIS_ENDPOINTS.find(e =>
        e.name.toLowerCase() === cityLower &&
        (!stateName || e.state.toUpperCase() === stateName.toUpperCase())
      ) || null;
    case 'socrata':
      return SOCRATA_ENDPOINTS.find(e =>
        e.name.toLowerCase() === cityLower &&
        (!stateName || e.state.toUpperCase() === stateName.toUpperCase())
      ) || null;
    case 'carto':
      return CARTO_ENDPOINTS.find(e =>
        e.name.toLowerCase() === cityLower &&
        (!stateName || e.state.toUpperCase() === stateName.toUpperCase())
      ) || null;
    case 'ckan':
      return CKAN_ENDPOINTS.find(e =>
        e.name.toLowerCase() === cityLower &&
        (!stateName || e.state.toUpperCase() === stateName.toUpperCase())
      ) || null;
    default:
      return null;
  }
}

async function runIngestion(
  supabase: SupabaseClient,
  source: DataSourceConfig,
  dryRun: boolean
): Promise<{ counts: IngestionCounts; error?: string }> {
  const counts: IngestionCounts = {
    features_fetched: 0,
    features_inserted: 0,
    features_updated: 0,
    features_skipped: 0,
  };

  if (!source.source_category) {
    return { counts, error: 'No source_category specified' };
  }

  const supportedCategories = ['arcgis', 'socrata', 'carto', 'ckan'];
  if (!supportedCategories.includes(source.source_category)) {
    return { counts, error: `Ingestion not implemented for source type: ${source.source_category}` };
  }

  const endpoint = findEndpoint(source.source_category, source.city, source.state);
  if (!endpoint) {
    return { counts, error: `No endpoint configuration found for ${source.city}, ${source.state} (${source.source_category})` };
  }

  let incidents: CrimeIncident[] = [];

  try {
    switch (source.source_category) {
      case 'arcgis':
        incidents = await fetchArcGISData(endpoint as ArcGISEndpoint);
        break;
      case 'socrata':
        incidents = await fetchSocrataData(endpoint as SocrataEndpoint);
        break;
      case 'carto':
        incidents = await fetchCartoData(endpoint as CartoEndpoint);
        break;
      case 'ckan':
        incidents = await fetchCKANData(endpoint as CKANEndpoint);
        break;
    }

    counts.features_fetched = incidents.length;

    if (incidents.length === 0) {
      console.log('No incidents found.');
      return { counts };
    }

    if (!source.cumulative_mode && source.city && source.state) {
      await clearCityData(supabase, source.city, source.state, dryRun);
    }

    console.log('\nInserting to database...');
    const { inserted, skipped, errors } = await upsertIncidents(
      supabase, 
      incidents, 
      dryRun, 
      source.cumulative_mode === true
    );

    counts.features_inserted = inserted;
    counts.features_skipped = skipped;

    if (errors > 0) {
      return { counts, error: `${errors} records failed to insert` };
    }

    console.log(`\nIngestion complete: ${inserted} inserted, ${skipped} skipped (duplicates)`);


    return { counts };
  } catch (err: any) {
    return { counts, error: err.message };
  }
}

async function main() {
  const args = process.argv.slice(2);

  const idIndex = args.indexOf('--id');
  if (idIndex === -1 || !args[idIndex + 1]) {
    console.log(`
Usage:
  npx tsx scripts/run-ingestion.ts --id <uuid>
  npx tsx scripts/run-ingestion.ts --id <uuid> --dry-run

Options:
  --id        Data source config UUID (required)
  --dry-run   Test without writing to database
`);
    process.exit(1);
  }

  const sourceId = args[idIndex + 1];
  const dryRun = args.includes('--dry-run');

  console.log('='.repeat(60));
  console.log('Ingestion Runner');
  console.log('='.repeat(60));
  console.log(`Source ID: ${sourceId}`);
  if (dryRun) console.log('Mode: DRY RUN');
  console.log('');

  const supabase = await getSupabase();

  const source = await getDataSourceById(supabase, sourceId);
  if (!source) {
    console.error(`Data source not found with ID: ${sourceId}`);
    process.exit(1);
  }

  console.log(`Source: ${source.source_name}`);
  console.log(`Type: ${source.source_type} | Category: ${source.source_category || 'N/A'}`);
  console.log(`City: ${source.city || 'N/A'} | State: ${source.state || 'N/A'}`);
  console.log(`Cumulative Mode: ${source.cumulative_mode ? 'Yes' : 'No'}`);
  console.log('');

  const startTime = Date.now();

  let runId = await findPendingRun(supabase, sourceId);
  if (runId) {
    console.log(`Found pending run: ${runId}`);
    await updateRunToRunning(supabase, runId);
  } else {
    console.log('No pending run found, creating new run...');
    runId = await createIngestionRun(supabase, sourceId);
    if (!runId) {
      console.error('Failed to create ingestion run');
      process.exit(1);
    }
  }

  console.log(`Run ID: ${runId}`);
  console.log('');

  const { counts, error } = await runIngestion(supabase, source, dryRun);
  const durationMs = Date.now() - startTime;

  const status = error ? 'failed' : 'success';

  if (!dryRun) {
    await updateIngestionRun(supabase, runId, status, counts, error);

    const recordCount = source.city && source.state
      ? await getRecordCount(supabase, source.city, source.state)
      : counts.features_inserted;

    await updateDataSourceConfig(supabase, sourceId, status, durationMs, recordCount, error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Status: ${status.toUpperCase()}`);
  console.log(`Duration: ${(durationMs / 1000).toFixed(1)}s`);
  console.log(`Fetched: ${counts.features_fetched}`);
  console.log(`Inserted: ${counts.features_inserted}`);
  console.log(`Updated: ${counts.features_updated}`);
  console.log(`Skipped: ${counts.features_skipped}`);
  if (error) console.log(`Error: ${error}`);

  if (status === 'failed') {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
