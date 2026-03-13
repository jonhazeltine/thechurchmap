#!/usr/bin/env npx tsx
/**
 * CDC PLACES Michigan Health Data Ingestion Script
 * 
 * Fetches tract-level health data from CDC PLACES Data Portal (Socrata API)
 * for all Michigan census tracts. The data includes 40+ health metrics
 * covering clinical care, health behaviors, health outcomes, disabilities,
 * and social needs.
 * 
 * API Endpoint: https://data.cdc.gov/resource/cwsq-ngmh.json
 * 
 * Usage: npx tsx scripts/ingest-cdc-places-michigan.ts
 * 
 * Michigan State FIPS: 26
 * Michigan State Abbreviation: MI
 */

import { createClient } from '@supabase/supabase-js';

const CDC_PLACES_API = 'https://data.cdc.gov/resource/cwsq-ngmh.json';
const MICHIGAN_ABBR = 'MI';

// Supabase setup
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Map CDC PLACES measureid to our metric_key
// CDC uses uppercase codes like OBESITY, DIABETES, etc.
const CDC_TO_METRIC_KEY: Record<string, string> = {
  // Clinical Care & Prevention
  'ACCESS2': 'health_insurance',     // Lack of health insurance (18-64)
  'CHECKUP': 'routine_checkup',       // Annual checkup
  'DENTAL': 'dental_visit',           // Dental visit
  'CHOLSCREEN': 'cholesterol_screening', // Cholesterol screening
  'COLON_SCREEN': 'colorectal_cancer_screening', // Colorectal cancer screening
  'MAMMOUSE': 'mammography',           // Mammography
  'BPMED': 'taking_bp_medication',     // Taking BP medication
  
  // Health Behaviors
  'BINGE': 'binge_drinking',           // Binge drinking
  'CSMOKING': 'current_smoking',       // Current smoking
  'LPA': 'physical_inactivity',        // Physical inactivity
  'SLEEP': 'sleep',                    // Short sleep (<7 hours)
  
  // Health Outcomes
  'ARTHRITIS': 'arthritis',
  'CASTHMA': 'asthma',                 // Current asthma
  'CANCER': 'cancer',                  // Cancer (non-skin)
  'CHD': 'cardiovascular_disease',     // Coronary heart disease
  'COPD': 'copd',
  'DEPRESSION': 'depression',
  'DIABETES': 'diabetes',
  'MHLTH': 'frequent_mental_distress', // Mental health not good ≥14 days
  'PHLTH': 'frequent_physical_distress', // Physical health not good ≥14 days
  'GHLTH': 'general_health',           // Fair or poor health
  'BPHIGH': 'high_blood_pressure',     // High blood pressure
  'HIGHCHOL': 'high_cholesterol',      // High cholesterol
  'OBESITY': 'obesity',
  'STROKE': 'stroke',
  'TEETHLOST': 'teeth_lost',           // All teeth lost (65+)
  
  // Disabilities
  'DISABILITY': 'any_disability',       // Any disability
  'COGNITION': 'cognitive_disability',  // Cognitive disability
  'HEARING': 'hearing_disability',      // Hearing disability
  'MOBILITY': 'mobility_disability',    // Mobility disability
  'VISION': 'vision_disability',        // Vision disability
  'SELFCARE': 'self_care_disability',   // Self-care disability
  'INDEPLIVE': 'independent_living_disability', // Independent living disability
  
  // Social Needs (SDOH)
  'FOODSTAMP': 'food_stamps',           // Receiving SNAP
  'FOODINSEC': 'food_insecurity',       // Food insecurity
  'HINSEC': 'housing_insecurity',       // Housing insecurity
  'SOCISOL': 'social_isolation',        // Social isolation
  'LACKSOCSUP': 'lack_social_support',  // Lack of social/emotional support
  'TRANSBARR': 'transportation_barriers', // Transportation barriers
  'UTILSHUT': 'utility_shutoff_threat', // Utility shutoff threat
};

interface CDCPlacesRecord {
  year: string;
  stateabbr: string;
  statedesc: string;
  countyname: string;
  countyfips: string;
  locationname: string; // Tract ID
  locationid: string;   // Full tract FIPS
  category: string;
  measure: string;
  measureid: string;
  data_value: string;
  data_value_type: string;
  low_confidence_limit: string;
  high_confidence_limit: string;
  totalpopulation: string;
  geolocation?: { type: string; coordinates: [number, number] };
}

interface MetricRecord {
  id: string;
  metric_key: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCDCData(): Promise<CDCPlacesRecord[]> {
  const allRecords: CDCPlacesRecord[] = [];
  let offset = 0;
  const batchSize = 10000; // CDC API supports up to 50000 per request
  let hasMore = true;
  
  console.log(`\nFetching CDC PLACES data for Michigan (${MICHIGAN_ABBR})...`);
  
  while (hasMore) {
    const params = new URLSearchParams({
      'stateabbr': MICHIGAN_ABBR,
      '$limit': String(batchSize),
      '$offset': String(offset),
      '$order': 'locationid,measureid',
    });
    
    const url = `${CDC_PLACES_API}?${params.toString()}`;
    
    try {
      console.log(`  Fetching batch at offset ${offset}...`);
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'kingdom-map-health-import/1.0',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`  API error: ${response.status} - ${errorText.substring(0, 200)}`);
        throw new Error(`API error: ${response.status}`);
      }
      
      const data: CDCPlacesRecord[] = await response.json();
      
      if (!data || data.length === 0) {
        hasMore = false;
        continue;
      }
      
      allRecords.push(...data);
      console.log(`  Total records fetched: ${allRecords.length}`);
      
      if (data.length < batchSize) {
        hasMore = false;
      } else {
        offset += batchSize;
        // Rate limit - CDC is generous but be respectful
        await sleep(500);
      }
      
    } catch (error: any) {
      console.error(`  Error fetching batch:`, error.message);
      // Try to continue with next batch
      offset += batchSize;
      await sleep(2000);
    }
  }
  
  return allRecords;
}

async function getOrCreateMetrics(): Promise<Map<string, string>> {
  const metricKeyToId = new Map<string, string>();
  
  // First, get existing metrics from database
  const { data: existingMetrics, error } = await supabase
    .from('health_metrics')
    .select('id, metric_key');
  
  if (error) {
    console.error('Error fetching existing metrics:', error);
    throw error;
  }
  
  for (const metric of existingMetrics || []) {
    metricKeyToId.set(metric.metric_key, metric.id);
  }
  
  console.log(`Found ${metricKeyToId.size} existing metrics in database`);
  
  // Check which metrics we need to create
  const neededMetrics = new Set<string>();
  for (const metricKey of Object.values(CDC_TO_METRIC_KEY)) {
    if (!metricKeyToId.has(metricKey)) {
      neededMetrics.add(metricKey);
    }
  }
  
  if (neededMetrics.size > 0) {
    console.log(`Need to create ${neededMetrics.size} new metrics: ${[...neededMetrics].join(', ')}`);
    
    // Get category IDs
    const { data: categories } = await supabase
      .from('health_metric_categories')
      .select('id, name');
    
    const categoryMap = new Map(categories?.map(c => [c.name, c.id]) || []);
    
    // Create missing metrics
    for (const metricKey of neededMetrics) {
      const categoryName = getCategoryForMetric(metricKey);
      const categoryId = categoryMap.get(categoryName);
      
      const { data, error } = await supabase
        .from('health_metrics')
        .insert({
          metric_key: metricKey,
          display_name: getDisplayName(metricKey),
          category_id: categoryId,
          description: '',
          unit: '%',
          is_percentage: true,
          higher_is_better: !isNegativeMetric(metricKey),
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

function getCategoryForMetric(metricKey: string): string {
  const categoryMap: Record<string, string> = {
    // Clinical Care
    'health_insurance': 'clinical_care',
    'routine_checkup': 'clinical_care',
    'dental_visit': 'clinical_care',
    'cholesterol_screening': 'clinical_care',
    'colorectal_cancer_screening': 'clinical_care',
    'mammography': 'clinical_care',
    'taking_bp_medication': 'clinical_care',
    
    // Health Behavior
    'binge_drinking': 'health_behavior',
    'current_smoking': 'health_behavior',
    'physical_inactivity': 'health_behavior',
    'sleep': 'health_behavior',
    
    // Health Outcomes
    'arthritis': 'health_outcomes',
    'asthma': 'health_outcomes',
    'cancer': 'health_outcomes',
    'cardiovascular_disease': 'health_outcomes',
    'copd': 'health_outcomes',
    'depression': 'health_outcomes',
    'diabetes': 'health_outcomes',
    'frequent_mental_distress': 'health_outcomes',
    'frequent_physical_distress': 'health_outcomes',
    'general_health': 'health_outcomes',
    'high_blood_pressure': 'health_outcomes',
    'high_cholesterol': 'health_outcomes',
    'obesity': 'health_outcomes',
    'stroke': 'health_outcomes',
    'teeth_lost': 'health_outcomes',
    
    // Disabilities
    'any_disability': 'health_outcomes', // Grouped with outcomes
    'cognitive_disability': 'health_outcomes',
    'hearing_disability': 'health_outcomes',
    'mobility_disability': 'health_outcomes',
    'vision_disability': 'health_outcomes',
    'self_care_disability': 'health_outcomes',
    'independent_living_disability': 'health_outcomes',
    
    // Social Needs
    'food_stamps': 'social_economic',
    'food_insecurity': 'social_economic',
    'housing_insecurity': 'social_economic',
    'social_isolation': 'social_economic',
    'lack_social_support': 'social_economic',
    'transportation_barriers': 'social_economic',
    'utility_shutoff_threat': 'social_economic',
  };
  
  return categoryMap[metricKey] || 'health_outcomes';
}

function getDisplayName(metricKey: string): string {
  const displayNames: Record<string, string> = {
    'health_insurance': 'Uninsured Adults 18-64',
    'routine_checkup': 'Annual Checkup',
    'dental_visit': 'Dental Visit',
    'cholesterol_screening': 'Cholesterol Screening',
    'colorectal_cancer_screening': 'Colorectal Cancer Screening',
    'mammography': 'Mammography (Women 50-74)',
    'taking_bp_medication': 'Taking BP Medication',
    'binge_drinking': 'Binge Drinking',
    'current_smoking': 'Current Smoking',
    'physical_inactivity': 'Physical Inactivity',
    'sleep': 'Short Sleep (<7 hours)',
    'arthritis': 'Arthritis',
    'asthma': 'Asthma',
    'cancer': 'Cancer (non-skin)',
    'cardiovascular_disease': 'Coronary Heart Disease',
    'copd': 'COPD',
    'depression': 'Depression',
    'diabetes': 'Diabetes',
    'frequent_mental_distress': 'Frequent Mental Distress',
    'frequent_physical_distress': 'Frequent Physical Distress',
    'general_health': 'Fair/Poor Health Status',
    'high_blood_pressure': 'High Blood Pressure',
    'high_cholesterol': 'High Cholesterol',
    'obesity': 'Obesity',
    'stroke': 'Stroke',
    'teeth_lost': 'All Teeth Lost (65+)',
    'any_disability': 'Any Disability',
    'cognitive_disability': 'Cognitive Disability',
    'hearing_disability': 'Hearing Disability',
    'mobility_disability': 'Mobility Disability',
    'vision_disability': 'Vision Disability',
    'self_care_disability': 'Self-Care Disability',
    'independent_living_disability': 'Independent Living Disability',
    'food_stamps': 'Receiving Food Stamps/SNAP',
    'food_insecurity': 'Food Insecurity',
    'housing_insecurity': 'Housing Insecurity',
    'social_isolation': 'Social Isolation',
    'lack_social_support': 'Lack of Social/Emotional Support',
    'transportation_barriers': 'Transportation Barriers',
    'utility_shutoff_threat': 'Utility Shutoff Threat',
  };
  
  return displayNames[metricKey] || metricKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function isNegativeMetric(metricKey: string): boolean {
  // Most health metrics are "negative" - higher values = worse outcomes
  const positiveMetrics = new Set([
    'routine_checkup', 'dental_visit', 'cholesterol_screening',
    'colorectal_cancer_screening', 'mammography', 'taking_bp_medication',
  ]);
  return !positiveMetrics.has(metricKey);
}

async function upsertHealthData(
  records: CDCPlacesRecord[], 
  metricKeyToId: Map<string, string>
): Promise<{ inserted: number; updated: number; skipped: number; errors: number }> {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  // Group records by tract for batch processing
  const batchSize = 500;
  const dataToInsert: any[] = [];
  
  for (const record of records) {
    // Map CDC measureid to our metric_key
    const metricKey = CDC_TO_METRIC_KEY[record.measureid];
    if (!metricKey) {
      skipped++;
      continue; // Skip metrics we don't track
    }
    
    const metricId = metricKeyToId.get(metricKey);
    if (!metricId) {
      console.warn(`  No metric ID found for ${metricKey}`);
      skipped++;
      continue;
    }
    
    const estimate = parseFloat(record.data_value);
    if (isNaN(estimate)) {
      skipped++;
      continue;
    }
    
    dataToInsert.push({
      metric_id: metricId,
      geo_fips: record.locationid, // Full 11-digit tract FIPS
      geo_level: 'tract',
      geo_name: `Tract ${record.locationname}`,
      state_fips: record.locationid.substring(0, 2), // First 2 digits
      state_abbr: record.stateabbr,
      estimate: estimate,
      lower_ci: record.low_confidence_limit ? parseFloat(record.low_confidence_limit) : null,
      upper_ci: record.high_confidence_limit ? parseFloat(record.high_confidence_limit) : null,
      denominator: record.totalpopulation ? parseInt(record.totalpopulation) : null,
      data_period: record.year,
      period_type: 'annual',
      source_name: 'CDC PLACES',
      group_name: 'Total',
      census_year: parseInt(record.year),
      version: '2024',
    });
    
    // Process batch when full
    if (dataToInsert.length >= batchSize) {
      const result = await insertBatch(dataToInsert);
      inserted += result.inserted;
      errors += result.errors;
      dataToInsert.length = 0;
      
      console.log(`  Progress: ${inserted} inserted, ${errors} errors, ${skipped} skipped`);
    }
  }
  
  // Process remaining records
  if (dataToInsert.length > 0) {
    const result = await insertBatch(dataToInsert);
    inserted += result.inserted;
    errors += result.errors;
  }
  
  return { inserted, updated, skipped, errors };
}

async function insertBatch(data: any[]): Promise<{ inserted: number; errors: number }> {
  let inserted = 0;
  let errors = 0;
  
  // Use upsert with conflict handling
  const { data: result, error } = await supabase
    .from('health_metric_data')
    .upsert(data, {
      onConflict: 'metric_id,geo_fips,data_period,group_name',
      ignoreDuplicates: false,
    });
  
  if (error) {
    console.error(`  Batch error:`, error.message);
    errors = data.length;
  } else {
    inserted = data.length;
  }
  
  return { inserted, errors };
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     CDC PLACES Michigan Health Data Ingestion Script       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Source: CDC PLACES Data Portal (Socrata API)');
  console.log('Target State: Michigan (MI)');
  console.log('');
  
  // Step 1: Fetch CDC PLACES data
  console.log('STEP 1: Fetching CDC PLACES data...');
  const records = await fetchCDCData();
  console.log(`  Total records fetched: ${records.length}`);
  
  if (records.length === 0) {
    console.error('No data fetched from CDC PLACES API');
    process.exit(1);
  }
  
  // Count unique tracts and metrics
  const uniqueTracts = new Set(records.map(r => r.locationid));
  const uniqueMeasures = new Set(records.map(r => r.measureid));
  console.log(`  Unique census tracts: ${uniqueTracts.size}`);
  console.log(`  Unique measures: ${uniqueMeasures.size}`);
  console.log(`  CDC measures found: ${[...uniqueMeasures].join(', ')}`);
  
  // Step 2: Ensure metrics exist in database
  console.log('\nSTEP 2: Checking/creating metrics in database...');
  const metricKeyToId = await getOrCreateMetrics();
  console.log(`  Metrics ready: ${metricKeyToId.size}`);
  
  // Step 3: Upsert health data
  console.log('\nSTEP 3: Upserting health data...');
  const result = await upsertHealthData(records, metricKeyToId);
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('                    INGESTION SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  CDC Records Fetched:   ${records.length}`);
  console.log(`  Unique Census Tracts:  ${uniqueTracts.size}`);
  console.log(`  Unique Measures:       ${uniqueMeasures.size}`);
  console.log(`  Records Inserted:      ${result.inserted}`);
  console.log(`  Records Skipped:       ${result.skipped}`);
  console.log(`  Errors:                ${result.errors}`);
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
