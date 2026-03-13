import { createClient } from '@supabase/supabase-js';
import { ALL_ENDPOINTS } from './config/crime-sources';

const BATCH_SIZE = 500;
const MIN_POPULATION = 100;

const CRIME_METRIC_KEYS = [
  'total_crime_rate',
  'violent_crime_rate',
  'property_crime_rate',
  'assault_rate',
  'robbery_rate',
  'burglary_rate',
  'theft_rate',
  'vehicle_theft_rate',
  'vandalism_rate',
  'drug_rate'
] as const;

type CrimeMetricKey = typeof CRIME_METRIC_KEYS[number];

interface AggregatedCrime {
  tractFips: string;
  metricKey: string;
  count: number;
}

interface TractCrimeStats {
  tractFips: string;
  population: number;
  crimeCounts: Record<CrimeMetricKey, number>;
  crimeRates: Record<CrimeMetricKey, number | null>;
}

const STATE_FIPS_MAP: Record<string, string> = {
  'AL': '01', 'AK': '02', 'AZ': '04', 'AR': '05', 'CA': '06',
  'CO': '08', 'CT': '09', 'DE': '10', 'DC': '11', 'FL': '12',
  'GA': '13', 'HI': '15', 'ID': '16', 'IL': '17', 'IN': '18',
  'IA': '19', 'KS': '20', 'KY': '21', 'LA': '22', 'ME': '23',
  'MD': '24', 'MA': '25', 'MI': '26', 'MN': '27', 'MS': '28',
  'MO': '29', 'MT': '30', 'NE': '31', 'NV': '32', 'NH': '33',
  'NJ': '34', 'NM': '35', 'NY': '36', 'NC': '37', 'ND': '38',
  'OH': '39', 'OK': '40', 'OR': '41', 'PA': '42', 'RI': '44',
  'SC': '45', 'SD': '46', 'TN': '47', 'TX': '48', 'UT': '49',
  'VT': '50', 'VA': '51', 'WA': '53', 'WV': '54', 'WI': '55',
  'WY': '56',
};

function getStateFips(stateAbbr: string): string {
  return STATE_FIPS_MAP[stateAbbr] || '00';
}

async function getMetricIds(
  supabase: ReturnType<typeof createClient<any>>
): Promise<Map<string, string>> {
  const metricIdMap = new Map<string, string>();
  
  const { data, error } = await supabase
    .from('health_metrics')
    .select('id, metric_key')
    .in('metric_key', [...CRIME_METRIC_KEYS]);
  
  if (error) {
    console.error(`Error fetching metrics: ${error.message}`);
    return metricIdMap;
  }
  
  for (const row of (data as any[]) || []) {
    metricIdMap.set(row.metric_key, row.id);
  }
  
  console.log(`Found ${metricIdMap.size}/${CRIME_METRIC_KEYS.length} crime metrics in database`);
  return metricIdMap;
}

async function getTractPopulations(
  supabase: ReturnType<typeof createClient<any>>,
  stateFips: string
): Promise<Map<string, number>> {
  const populations = new Map<string, number>();
  
  const { data: popMetric } = await supabase
    .from('health_metrics')
    .select('id')
    .eq('metric_key', 'total_population')
    .single();
  
  if (!popMetric) {
    return populations;
  }
  
  const { data } = await supabase
    .from('health_metric_data')
    .select('geo_fips, estimate')
    .eq('metric_id', (popMetric as any).id)
    .eq('geo_level', 'tract')
    .like('geo_fips', `${stateFips}%`);
  
  for (const row of (data as any[]) || []) {
    if (row.estimate && row.geo_fips) {
      populations.set(row.geo_fips, row.estimate);
    }
  }
  
  return populations;
}

async function aggregateCrimeByTractFips(
  supabase: ReturnType<typeof createClient<any>>,
  stateAbbr: string,
  monthsBack: number
): Promise<AggregatedCrime[]> {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - monthsBack);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];
  
  console.log(`  Aggregating crime by tract_fips (since ${cutoffStr})...`);
  
  const { data, error } = await supabase.rpc('fn_crime_rolling_window_aggregate', {
    p_state_abbr: stateAbbr,
    p_months: monthsBack
  });
  
  if (error) {
    if (error.message.includes('Could not find the function')) {
      console.log(`  RPC not available, falling back to direct query...`);
      return await aggregateCrimeByTractFipsFallback(supabase, stateAbbr, cutoffStr);
    }
    console.error(`  RPC error: ${error.message}`);
    return [];
  }
  
  const results: AggregatedCrime[] = (data as any[] || []).map(row => ({
    tractFips: row.tract_fips,
    metricKey: row.metric_key,
    count: Number(row.incident_count)
  }));
  
  console.log(`  Found ${results.length} tract/crime-type combinations`);
  return results;
}

async function aggregateCrimeByTractFipsFallback(
  supabase: ReturnType<typeof createClient<any>>,
  stateAbbr: string,
  cutoffStr: string
): Promise<AggregatedCrime[]> {
  const tractCounts = new Map<string, Map<string, number>>();
  
  const now = new Date();
  const cutoffDate = new Date(cutoffStr);
  const monthChunks: { start: string; end: string }[] = [];
  
  let current = new Date(now);
  while (current >= cutoffDate) {
    const end = current.toISOString().split('T')[0];
    current.setMonth(current.getMonth() - 1);
    const start = current >= cutoffDate 
      ? current.toISOString().split('T')[0] 
      : cutoffStr;
    monthChunks.push({ start, end });
    if (current < cutoffDate) break;
  }
  
  console.log(`  Processing ${monthChunks.length} monthly chunks...`);
  let totalRows = 0;
  
  for (let i = 0; i < monthChunks.length; i++) {
    const chunk = monthChunks[i];
    const pageSize = 10000;
    let offset = 0;
    let hasMore = true;
    
    while (hasMore) {
      const { data, error } = await supabase
        .from('crime_incidents')
        .select('tract_fips, normalized_type')
        .eq('state', stateAbbr)
        .not('tract_fips', 'is', null)
        .not('normalized_type', 'is', null)
        .gte('incident_date', chunk.start)
        .lt('incident_date', chunk.end)
        .range(offset, offset + pageSize - 1);
      
      if (error) {
        if (error.message.includes('timeout')) {
          console.error(`\n  Timeout on chunk ${i+1}/${monthChunks.length}, retrying with smaller batch...`);
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        console.error(`\n  Query error: ${error.message}`);
        break;
      }
      
      const rows = (data as any[]) || [];
      hasMore = rows.length === pageSize;
      offset += pageSize;
      totalRows += rows.length;
      
      for (const row of rows) {
        if (!tractCounts.has(row.tract_fips)) {
          tractCounts.set(row.tract_fips, new Map());
        }
        const typeMap = tractCounts.get(row.tract_fips)!;
        typeMap.set(row.normalized_type, (typeMap.get(row.normalized_type) || 0) + 1);
      }
    }
    
    process.stdout.write(`\r  Chunk ${i+1}/${monthChunks.length}: ${totalRows.toLocaleString()} rows`);
  }
  
  console.log('');
  
  const results: AggregatedCrime[] = [];
  for (const [tractFips, typeMap] of tractCounts) {
    for (const [metricKey, count] of typeMap) {
      results.push({ tractFips, metricKey, count });
    }
  }
  
  console.log(`  Found ${results.length} tract/crime-type combinations from ${tractCounts.size} tracts`);
  return results;
}

function calculateRatesFromAggregation(
  aggregated: AggregatedCrime[],
  populations: Map<string, number>
): TractCrimeStats[] {
  const tractStatsMap = new Map<string, TractCrimeStats>();
  
  for (const agg of aggregated) {
    if (!tractStatsMap.has(agg.tractFips)) {
      const population = populations.get(agg.tractFips) || 0;
      const crimeCounts: Record<string, number> = {};
      const crimeRates: Record<string, number | null> = {};
      for (const key of CRIME_METRIC_KEYS) {
        crimeCounts[key] = 0;
        crimeRates[key] = null;
      }
      tractStatsMap.set(agg.tractFips, {
        tractFips: agg.tractFips,
        population,
        crimeCounts: crimeCounts as Record<CrimeMetricKey, number>,
        crimeRates: crimeRates as Record<CrimeMetricKey, number | null>,
      });
    }
    
    const stats = tractStatsMap.get(agg.tractFips)!;
    if (CRIME_METRIC_KEYS.includes(agg.metricKey as CrimeMetricKey)) {
      stats.crimeCounts[agg.metricKey as CrimeMetricKey] = agg.count;
    }
  }
  
  let tractsWithRates = 0;
  for (const stats of tractStatsMap.values()) {
    if (stats.population >= MIN_POPULATION) {
      tractsWithRates++;
      for (const metricKey of CRIME_METRIC_KEYS) {
        const count = stats.crimeCounts[metricKey];
        stats.crimeRates[metricKey] = Math.round((count / stats.population) * 100000 * 100) / 100;
      }
    }
  }
  
  console.log(`  ${tractsWithRates} tracts have sufficient population for rate calculation`);
  
  return Array.from(tractStatsMap.values());
}

async function storeRollingWindowData(
  supabase: ReturnType<typeof createClient<any>>,
  stats: TractCrimeStats[],
  metricIdMap: Map<string, string>,
  stateFips: string,
  stateAbbr: string,
  dataPeriod: string
): Promise<{ inserted: number; errors: number }> {
  const rows: any[] = [];
  
  for (const stat of stats) {
    for (const metricKey of CRIME_METRIC_KEYS) {
      const rate = stat.crimeRates[metricKey];
      const count = stat.crimeCounts[metricKey];
      const metricId = metricIdMap.get(metricKey);
      
      if (rate !== null && metricId) {
        rows.push({
          metric_id: metricId,
          geo_fips: stat.tractFips,
          geo_level: 'tract',
          geo_name: `Tract ${stat.tractFips}`,
          state_fips: stateFips,
          state_abbr: stateAbbr,
          estimate: rate,
          numerator: count,
          denominator: stat.population,
          data_period: dataPeriod,
          period_type: 'rolling',
          source_name: 'Crime Incidents (Rolling)',
          group_name: 'Total',
        });
      }
    }
  }
  
  if (rows.length === 0) {
    return { inserted: 0, errors: 0 };
  }
  
  console.log(`  Upserting ${rows.length} records...`);
  
  let inserted = 0;
  let errors = 0;
  
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    
    const { error } = await (supabase as any)
      .from('health_metric_data')
      .upsert(batch, {
        onConflict: 'metric_id,geo_fips,data_period,group_name',
        ignoreDuplicates: false,
      });
    
    if (error) {
      errors += batch.length;
    } else {
      inserted += batch.length;
    }
  }
  
  return { inserted, errors };
}

function getCitiesFromConfig(stateFilter?: string): { city: string; state: string; stateFips: string }[] {
  const cityMap = new Map<string, { city: string; state: string; stateFips: string }>();
  
  for (const endpoint of ALL_ENDPOINTS) {
    if (stateFilter && endpoint.state !== stateFilter) continue;
    
    const key = `${endpoint.name}-${endpoint.state}`;
    if (!cityMap.has(key)) {
      cityMap.set(key, {
        city: endpoint.name,
        state: endpoint.state,
        stateFips: endpoint.stateFips || getStateFips(endpoint.state),
      });
    }
  }
  
  return Array.from(cityMap.values()).sort((a, b) => a.city.localeCompare(b.city));
}

async function processState(
  supabase: ReturnType<typeof createClient<any>>,
  stateAbbr: string,
  metricIdMap: Map<string, string>,
  windows: { months: number; period: string }[]
): Promise<{ state: string; results: Record<string, { aggregations: number; inserted: number; errors: number }> }> {
  const results: Record<string, { aggregations: number; inserted: number; errors: number }> = {};
  const stateFips = getStateFips(stateAbbr);
  
  console.log(`\nProcessing state: ${stateAbbr}`);
  
  const populations = await getTractPopulations(supabase, stateFips);
  console.log(`  Loaded ${populations.size} tract populations`);
  
  for (const window of windows) {
    console.log(`\n  ${window.period} (${window.months} months):`);
    
    const aggregated = await aggregateCrimeByTractFips(supabase, stateAbbr, window.months);
    
    if (aggregated.length === 0) {
      results[window.period] = { aggregations: 0, inserted: 0, errors: 0 };
      continue;
    }
    
    const stats = calculateRatesFromAggregation(aggregated, populations);
    const { inserted, errors } = await storeRollingWindowData(
      supabase,
      stats,
      metricIdMap,
      stateFips,
      stateAbbr,
      window.period
    );
    
    results[window.period] = { aggregations: aggregated.length, inserted, errors };
    console.log(`  ✓ ${inserted} records inserted`);
  }
  
  return { state: stateAbbr, results };
}

async function main() {
  const args = process.argv.slice(2);
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const stateIndex = args.indexOf('--state');
  const stateFilter = stateIndex !== -1 ? args[stateIndex + 1] : undefined;
  const only12mo = args.includes('--12mo-only');
  const only36mo = args.includes('--36mo-only');
  
  const windows: { months: number; period: string }[] = [];
  if (!only36mo) windows.push({ months: 12, period: '12mo_rolling' });
  if (!only12mo) windows.push({ months: 36, period: '36mo_rolling' });
  
  console.log('='.repeat(70));
  console.log('Crime Rolling Window Refresh (V2 - Uses tract_fips)');
  console.log('='.repeat(70));
  console.log(`Windows: ${windows.map(w => w.period).join(', ')}`);
  if (stateFilter) console.log(`State filter: ${stateFilter}`);
  console.log('');
  
  const metricIdMap = await getMetricIds(supabase);
  if (metricIdMap.size === 0) {
    console.error('Cannot proceed without crime metrics. Exiting.');
    process.exit(1);
  }
  
  const cities = getCitiesFromConfig(stateFilter);
  if (cities.length === 0) {
    console.log('No cities with crime data found.');
    return;
  }
  
  const uniqueStates = [...new Set(cities.map(c => c.state))].sort();
  console.log(`Processing ${uniqueStates.length} states with crime data...`);
  
  const summary = {
    statesProcessed: 0,
    totalInserted: 0,
    totalErrors: 0,
  };
  
  for (const stateAbbr of uniqueStates) {
    try {
      const { results } = await processState(supabase, stateAbbr, metricIdMap, windows);
      
      for (const window of windows) {
        const r = results[window.period];
        if (r) {
          summary.totalInserted += r.inserted;
          summary.totalErrors += r.errors;
        }
      }
      
      summary.statesProcessed++;
    } catch (error) {
      console.log(`ERROR: ${error instanceof Error ? error.message : error}`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('Summary');
  console.log('='.repeat(70));
  console.log(`States processed: ${summary.statesProcessed}`);
  console.log(`Records upserted: ${summary.totalInserted.toLocaleString()}`);
  if (summary.totalErrors > 0) {
    console.log(`Errors: ${summary.totalErrors}`);
  }
  console.log('');
}

main().catch(console.error);
