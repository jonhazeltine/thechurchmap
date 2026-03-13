#!/usr/bin/env npx tsx
/**
 * Census ACS Michigan Demographic Data Ingestion Script
 * 
 * Fetches tract-level socioeconomic data from Census ACS API for all Michigan 
 * census tracts. Includes poverty, income, education, and demographic data.
 * 
 * API Endpoint: https://api.census.gov/data/2022/acs/acs5
 * 
 * Note: Census API key recommended (free) to avoid rate limits.
 * Get one at: https://api.census.gov/data/key_signup.html
 * Set as CENSUS_API_KEY environment variable.
 * 
 * Usage: npx tsx scripts/ingest-census-acs-michigan.ts
 * 
 * Michigan State FIPS: 26
 */

import { createClient } from '@supabase/supabase-js';

const CENSUS_ACS_BASE = 'https://api.census.gov/data/2022/acs/acs5';
const MICHIGAN_FIPS = '26';

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const censusApiKey = process.env.CENSUS_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Census ACS variable definitions
// Format: { censusVar: { metric_key, calculation, description } }
const ACS_VARIABLES = {
  // Base population counts
  'B01003_001E': { name: 'total_population' },
  
  // Poverty variables (B17001)
  'B17001_001E': { name: 'poverty_universe' },  // Population for whom poverty determined
  'B17001_002E': { name: 'below_poverty' },      // Income below poverty level
  
  // Child poverty (under 18)
  'B17001_004E': { name: 'male_under_5_poverty' },
  'B17001_005E': { name: 'male_5_poverty' },
  'B17001_006E': { name: 'male_6_11_poverty' },
  'B17001_007E': { name: 'male_12_14_poverty' },
  'B17001_008E': { name: 'male_15_poverty' },
  'B17001_009E': { name: 'male_16_17_poverty' },
  'B17001_018E': { name: 'female_under_5_poverty' },
  'B17001_019E': { name: 'female_5_poverty' },
  'B17001_020E': { name: 'female_6_11_poverty' },
  'B17001_021E': { name: 'female_12_14_poverty' },
  'B17001_022E': { name: 'female_15_poverty' },
  'B17001_023E': { name: 'female_16_17_poverty' },
  
  // Total children for child poverty rate
  'B01001_003E': { name: 'male_under_5' },
  'B01001_004E': { name: 'male_5_9' },
  'B01001_005E': { name: 'male_10_14' },
  'B01001_006E': { name: 'male_15_17' },
  'B01001_027E': { name: 'female_under_5' },
  'B01001_028E': { name: 'female_5_9' },
  'B01001_029E': { name: 'female_10_14' },
  'B01001_030E': { name: 'female_15_17' },
  
  // Unemployment (B23025)
  'B23025_003E': { name: 'civilian_labor_force' }, // In labor force, civilian
  'B23025_005E': { name: 'unemployed' },            // Unemployed
  
  // Education - high school completion (B15003) - ages 25+
  'B15003_001E': { name: 'ed_universe' },           // Population 25+
  'B15003_017E': { name: 'hs_diploma' },            // High school diploma
  'B15003_018E': { name: 'ged' },                   // GED
  'B15003_019E': { name: 'some_college_1yr' },
  'B15003_020E': { name: 'some_college_more' },
  'B15003_021E': { name: 'associates' },
  'B15003_022E': { name: 'bachelors' },
  'B15003_023E': { name: 'masters' },
  'B15003_024E': { name: 'professional' },
  'B15003_025E': { name: 'doctorate' },
  
  // Health insurance (B27001) - uninsured
  'B27001_001E': { name: 'insurance_universe' },    // Total population
  'B27001_005E': { name: 'male_under_6_uninsured' },
  'B27001_008E': { name: 'male_6_18_uninsured' },
  'B27001_011E': { name: 'male_19_25_uninsured' },
  'B27001_014E': { name: 'male_26_34_uninsured' },
  'B27001_017E': { name: 'male_35_44_uninsured' },
  'B27001_020E': { name: 'male_45_54_uninsured' },
  'B27001_023E': { name: 'male_55_64_uninsured' },
  'B27001_026E': { name: 'male_65_74_uninsured' },
  'B27001_029E': { name: 'male_75_plus_uninsured' },
  'B27001_033E': { name: 'female_under_6_uninsured' },
  'B27001_036E': { name: 'female_6_18_uninsured' },
  'B27001_039E': { name: 'female_19_25_uninsured' },
  'B27001_042E': { name: 'female_26_34_uninsured' },
  'B27001_045E': { name: 'female_35_44_uninsured' },
  'B27001_048E': { name: 'female_45_54_uninsured' },
  'B27001_051E': { name: 'female_55_64_uninsured' },
  'B27001_054E': { name: 'female_65_74_uninsured' },
  'B27001_057E': { name: 'female_75_plus_uninsured' },
  
  // Income inequality - GINI index
  'B19083_001E': { name: 'gini_index' },
  
  // Median household income
  'B19013_001E': { name: 'median_household_income' },
  
  // Housing cost burden (B25070 - renters paying 30%+ of income)
  'B25070_001E': { name: 'renter_universe' },
  'B25070_007E': { name: 'rent_30_34' },
  'B25070_008E': { name: 'rent_35_39' },
  'B25070_009E': { name: 'rent_40_49' },
  'B25070_010E': { name: 'rent_50_plus' },
  
  // Broadband (B28002)
  'B28002_001E': { name: 'internet_universe' },
  'B28002_004E': { name: 'broadband_any' },
  
  // Single parent households (B09002)
  'B09002_001E': { name: 'children_in_households' },
  'B09002_008E': { name: 'children_father_only' },
  'B09002_015E': { name: 'children_mother_only' },
};

interface TractData {
  state: string;
  county: string;
  tract: string;
  [key: string]: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchACSData(): Promise<TractData[]> {
  const allData: TractData[] = [];
  
  // Get list of variables to fetch
  const variables = Object.keys(ACS_VARIABLES);
  console.log(`\nFetching ${variables.length} ACS variables for Michigan tracts...`);
  
  // Census API limits to 50 variables per request
  // Account for NAME field in first batch, so use 45 to be safe
  const variableBatches: string[][] = [];
  const batchSize = 45;
  
  for (let i = 0; i < variables.length; i += batchSize) {
    variableBatches.push(variables.slice(i, i + batchSize));
  }
  
  // Fetch first batch to get tract list
  const firstBatch = variableBatches[0];
  const varsStr = firstBatch.join(',');
  
  let url = `${CENSUS_ACS_BASE}?get=NAME,${varsStr}&for=tract:*&in=state:${MICHIGAN_FIPS}`;
  if (censusApiKey) {
    url += `&key=${censusApiKey}`;
  }
  
  console.log(`  Fetching batch 1/${variableBatches.length}...`);
  
  const response = await fetch(url);
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`API error: ${response.status} - ${errorText.substring(0, 200)}`);
    throw new Error(`Census API error: ${response.status}`);
  }
  
  const data = await response.json();
  const headers = data[0];
  const rows = data.slice(1);
  
  console.log(`  Retrieved ${rows.length} census tracts`);
  
  // Initialize tract data with first batch
  for (const row of rows) {
    const tractData: TractData = {
      state: '',
      county: '',
      tract: '',
    };
    
    for (let i = 0; i < headers.length; i++) {
      tractData[headers[i]] = row[i];
    }
    
    allData.push(tractData);
  }
  
  // Fetch remaining batches and merge
  for (let b = 1; b < variableBatches.length; b++) {
    const batch = variableBatches[b];
    const batchVarsStr = batch.join(',');
    
    console.log(`  Fetching batch ${b + 1}/${variableBatches.length}...`);
    
    let batchUrl = `${CENSUS_ACS_BASE}?get=${batchVarsStr}&for=tract:*&in=state:${MICHIGAN_FIPS}`;
    if (censusApiKey) {
      batchUrl += `&key=${censusApiKey}`;
    }
    
    await sleep(500); // Rate limit
    
    const batchResponse = await fetch(batchUrl);
    if (!batchResponse.ok) {
      console.error(`  Batch ${b + 1} failed, skipping...`);
      continue;
    }
    
    const batchData = await batchResponse.json();
    const batchHeaders = batchData[0];
    const batchRows = batchData.slice(1);
    
    // Merge batch data with existing tract data
    for (let i = 0; i < batchRows.length && i < allData.length; i++) {
      for (let j = 0; j < batchHeaders.length; j++) {
        allData[i][batchHeaders[j]] = batchRows[i][j];
      }
    }
  }
  
  return allData;
}

interface CalculatedMetrics {
  poverty: number | null;
  child_poverty: number | null;
  unemployment: number | null;
  high_school_completion: number | null;
  uninsured: number | null;
  income_inequality: number | null;
  housing_cost_burden: number | null;
  broadband_connection: number | null;
  children_in_single_parent_households: number | null;
}

function calculateMetrics(tract: TractData): CalculatedMetrics {
  const getNum = (key: string): number => {
    const val = tract[key];
    const num = parseInt(val);
    return isNaN(num) || num < 0 ? 0 : num;
  };
  
  const getFloat = (key: string): number | null => {
    const val = tract[key];
    const num = parseFloat(val);
    return isNaN(num) || num < 0 ? null : num;
  };
  
  // Poverty rate
  const povertyUniverse = getNum('B17001_001E');
  const belowPoverty = getNum('B17001_002E');
  const poverty = povertyUniverse > 0 ? (belowPoverty / povertyUniverse) * 100 : null;
  
  // Child poverty (under 18)
  const childPovertyNumerator = 
    getNum('B17001_004E') + getNum('B17001_005E') + getNum('B17001_006E') + 
    getNum('B17001_007E') + getNum('B17001_008E') + getNum('B17001_009E') +
    getNum('B17001_018E') + getNum('B17001_019E') + getNum('B17001_020E') +
    getNum('B17001_021E') + getNum('B17001_022E') + getNum('B17001_023E');
  
  const totalChildren = 
    getNum('B01001_003E') + getNum('B01001_004E') + getNum('B01001_005E') + getNum('B01001_006E') +
    getNum('B01001_027E') + getNum('B01001_028E') + getNum('B01001_029E') + getNum('B01001_030E');
  
  const child_poverty = totalChildren > 0 ? (childPovertyNumerator / totalChildren) * 100 : null;
  
  // Unemployment rate
  const laborForce = getNum('B23025_003E');
  const unemployed = getNum('B23025_005E');
  const unemployment = laborForce > 0 ? (unemployed / laborForce) * 100 : null;
  
  // High school completion (% with at least HS diploma)
  const edUniverse = getNum('B15003_001E');
  const hsOrHigher = 
    getNum('B15003_017E') + getNum('B15003_018E') + getNum('B15003_019E') +
    getNum('B15003_020E') + getNum('B15003_021E') + getNum('B15003_022E') +
    getNum('B15003_023E') + getNum('B15003_024E') + getNum('B15003_025E');
  const high_school_completion = edUniverse > 0 ? (hsOrHigher / edUniverse) * 100 : null;
  
  // Uninsured rate (all ages)
  const insuranceUniverse = getNum('B27001_001E');
  const totalUninsured = 
    getNum('B27001_005E') + getNum('B27001_008E') + getNum('B27001_011E') +
    getNum('B27001_014E') + getNum('B27001_017E') + getNum('B27001_020E') +
    getNum('B27001_023E') + getNum('B27001_026E') + getNum('B27001_029E') +
    getNum('B27001_033E') + getNum('B27001_036E') + getNum('B27001_039E') +
    getNum('B27001_042E') + getNum('B27001_045E') + getNum('B27001_048E') +
    getNum('B27001_051E') + getNum('B27001_054E') + getNum('B27001_057E');
  const uninsured = insuranceUniverse > 0 ? (totalUninsured / insuranceUniverse) * 100 : null;
  
  // GINI index (already a ratio, multiply by 100 for consistency?)
  const income_inequality = getFloat('B19083_001E');
  
  // Housing cost burden (renters paying 30%+ of income)
  const renterUniverse = getNum('B25070_001E');
  const costBurdened = 
    getNum('B25070_007E') + getNum('B25070_008E') + 
    getNum('B25070_009E') + getNum('B25070_010E');
  const housing_cost_burden = renterUniverse > 0 ? (costBurdened / renterUniverse) * 100 : null;
  
  // Broadband connection
  const internetUniverse = getNum('B28002_001E');
  const hasBroadband = getNum('B28002_004E');
  const broadband_connection = internetUniverse > 0 ? (hasBroadband / internetUniverse) * 100 : null;
  
  // Children in single-parent households
  const childrenInHouseholds = getNum('B09002_001E');
  const singleParent = getNum('B09002_008E') + getNum('B09002_015E');
  const children_in_single_parent_households = childrenInHouseholds > 0 
    ? (singleParent / childrenInHouseholds) * 100 
    : null;
  
  return {
    poverty,
    child_poverty,
    unemployment,
    high_school_completion,
    uninsured,
    income_inequality,
    housing_cost_burden,
    broadband_connection,
    children_in_single_parent_households,
  };
}

async function getOrCreateMetrics(): Promise<Map<string, string>> {
  const metricKeyToId = new Map<string, string>();
  
  const metricsNeeded = [
    'poverty', 'child_poverty', 'unemployment', 'high_school_completion',
    'uninsured', 'income_inequality', 'housing_cost_burden', 
    'broadband_connection', 'children_in_single_parent_households',
  ];
  
  // Fetch existing metrics
  const { data: existingMetrics } = await supabase
    .from('health_metrics')
    .select('id, metric_key')
    .in('metric_key', metricsNeeded);
  
  for (const metric of existingMetrics || []) {
    metricKeyToId.set(metric.metric_key, metric.id);
  }
  
  console.log(`  Found ${metricKeyToId.size}/${metricsNeeded.length} existing metrics`);
  
  // Create any missing metrics
  const { data: categories } = await supabase
    .from('health_metric_categories')
    .select('id, name');
  
  const categoryMap = new Map(categories?.map(c => [c.name, c.id]) || []);
  
  const metricDefs: Record<string, { display: string; category: string; isPositive: boolean }> = {
    'poverty': { display: 'Poverty Rate', category: 'social_economic', isPositive: false },
    'child_poverty': { display: 'Child Poverty', category: 'social_economic', isPositive: false },
    'unemployment': { display: 'Unemployment', category: 'social_economic', isPositive: false },
    'high_school_completion': { display: 'High School Completion', category: 'social_economic', isPositive: true },
    'uninsured': { display: 'Uninsured All Ages (Census)', category: 'social_economic', isPositive: false },
    'income_inequality': { display: 'Income Inequality (GINI)', category: 'social_economic', isPositive: false },
    'housing_cost_burden': { display: 'Housing Cost Burden (30%+)', category: 'physical_environment', isPositive: false },
    'broadband_connection': { display: 'Broadband Connection', category: 'physical_environment', isPositive: true },
    'children_in_single_parent_households': { display: 'Children in Single-Parent Households', category: 'social_economic', isPositive: false },
  };
  
  for (const metricKey of metricsNeeded) {
    if (!metricKeyToId.has(metricKey)) {
      const def = metricDefs[metricKey];
      const categoryId = categoryMap.get(def.category);
      
      const { data, error } = await supabase
        .from('health_metrics')
        .insert({
          metric_key: metricKey,
          display_name: def.display,
          category_id: categoryId,
          description: '',
          unit: metricKey === 'income_inequality' ? 'index' : '%',
          is_percentage: metricKey !== 'income_inequality',
          higher_is_better: def.isPositive,
          available_at_city: true,
          available_at_tract: true,
        })
        .select('id')
        .single();
      
      if (error) {
        console.error(`  Error creating metric ${metricKey}:`, error.message);
      } else if (data) {
        metricKeyToId.set(metricKey, data.id);
        console.log(`  Created metric: ${metricKey}`);
      }
    }
  }
  
  return metricKeyToId;
}

async function upsertHealthData(
  tracts: TractData[],
  metricKeyToId: Map<string, string>
): Promise<{ inserted: number; errors: number }> {
  let totalInserted = 0;
  let totalErrors = 0;
  
  const batchSize = 500;
  const dataToInsert: any[] = [];
  
  for (const tract of tracts) {
    const geoFips = `${tract.state}${tract.county}${tract.tract}`;
    const metrics = calculateMetrics(tract);
    
    for (const [metricKey, value] of Object.entries(metrics)) {
      if (value === null) continue;
      
      const metricId = metricKeyToId.get(metricKey);
      if (!metricId) continue;
      
      dataToInsert.push({
        metric_id: metricId,
        geo_fips: geoFips,
        geo_level: 'tract',
        geo_name: tract['NAME'] || `Tract ${tract.tract}`,
        state_fips: tract.state,
        state_abbr: 'MI',
        estimate: value,
        data_period: '2018-2022',
        period_type: 'ACS 5-year',
        source_name: 'Census ACS',
        group_name: 'Total',
        census_year: 2022,
        version: 'acs5_2022',
      });
      
      // Process batch when full
      if (dataToInsert.length >= batchSize) {
        const result = await insertBatch(dataToInsert);
        totalInserted += result.inserted;
        totalErrors += result.errors;
        dataToInsert.length = 0;
        
        process.stdout.write(`\r  Progress: ${totalInserted} inserted, ${totalErrors} errors`);
      }
    }
  }
  
  // Process remaining
  if (dataToInsert.length > 0) {
    const result = await insertBatch(dataToInsert);
    totalInserted += result.inserted;
    totalErrors += result.errors;
  }
  
  console.log(''); // New line after progress
  
  return { inserted: totalInserted, errors: totalErrors };
}

async function insertBatch(data: any[]): Promise<{ inserted: number; errors: number }> {
  const { error } = await supabase
    .from('health_metric_data')
    .upsert(data, {
      onConflict: 'metric_id,geo_fips,data_period,group_name',
      ignoreDuplicates: false,
    });
  
  if (error) {
    console.error(`\n  Batch error:`, error.message);
    return { inserted: 0, errors: data.length };
  }
  
  return { inserted: data.length, errors: 0 };
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Census ACS Michigan Demographic Data Ingestion         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Source: Census ACS 5-Year Estimates (2018-2022)');
  console.log('Target State: Michigan (FIPS 26)');
  console.log(`Census API Key: ${censusApiKey ? 'Configured' : 'Not set (may hit rate limits)'}`);
  console.log('');
  
  // Step 1: Fetch Census ACS data
  console.log('STEP 1: Fetching Census ACS data...');
  const tracts = await fetchACSData();
  console.log(`  Total tracts fetched: ${tracts.length}`);
  
  if (tracts.length === 0) {
    console.error('No data fetched from Census API');
    process.exit(1);
  }
  
  // Step 2: Ensure metrics exist
  console.log('\nSTEP 2: Checking/creating metrics in database...');
  const metricKeyToId = await getOrCreateMetrics();
  console.log(`  Metrics ready: ${metricKeyToId.size}`);
  
  // Step 3: Calculate and upsert health data
  console.log('\nSTEP 3: Calculating and upserting demographic data...');
  const result = await upsertHealthData(tracts, metricKeyToId);
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('                    INGESTION SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  Census Tracts Processed: ${tracts.length}`);
  console.log(`  Data Points Inserted:    ${result.inserted}`);
  console.log(`  Errors:                  ${result.errors}`);
  console.log('');
  console.log('Metrics ingested:');
  console.log('  - Poverty Rate');
  console.log('  - Child Poverty');
  console.log('  - Unemployment');
  console.log('  - High School Completion');
  console.log('  - Uninsured (All Ages)');
  console.log('  - Income Inequality (GINI)');
  console.log('  - Housing Cost Burden');
  console.log('  - Broadband Connection');
  console.log('  - Children in Single-Parent Households');
  console.log('═'.repeat(60));
}

// Run
main()
  .then(() => {
    console.log('\nScript completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
