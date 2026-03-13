#!/usr/bin/env npx tsx
/**
 * Crime Data Health Check Script
 * 
 * Verifies crime data consistency across the system:
 * - crime_incidents table health
 * - Rolling window data in health_metric_data
 * - Deduplication status
 * - Date range coverage by city
 * 
 * Usage:
 *   npx tsx scripts/check-crime-data-health.ts
 *   npx tsx scripts/check-crime-data-health.ts --verbose
 *   npx tsx scripts/check-crime-data-health.ts --city "Grand Rapids"
 */

import { createClient } from '@supabase/supabase-js';

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const cityIndex = args.indexOf('--city');
  const cityFilter = cityIndex !== -1 ? args[cityIndex + 1] : null;
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('='.repeat(70));
  console.log('Crime Data Health Check');
  console.log('='.repeat(70));
  console.log('');
  
  // 1. Check crime_incidents table
  console.log('1. CRIME INCIDENTS TABLE');
  console.log('-'.repeat(50));
  
  const { count: totalIncidents } = await supabase
    .from('crime_incidents')
    .select('*', { count: 'exact', head: true });
  
  console.log(`   Total records: ${(totalIncidents || 0).toLocaleString()}`);
  
  // Get date range
  const { data: dateRange } = await supabase
    .from('crime_incidents')
    .select('incident_date')
    .order('incident_date', { ascending: true })
    .limit(1);
  
  const { data: maxDate } = await supabase
    .from('crime_incidents')
    .select('incident_date')
    .order('incident_date', { ascending: false })
    .limit(1);
  
  if (dateRange?.[0] && maxDate?.[0]) {
    console.log(`   Date range: ${(dateRange[0] as any).incident_date?.substring(0, 10)} to ${(maxDate[0] as any).incident_date?.substring(0, 10)}`);
  }
  
  // Get city counts
  const { data: cityStats } = await supabase.rpc('get_crime_city_stats').limit(100) as { data: any[] | null };
  
  if (!cityStats) {
    // Fallback: manual query for cities
    console.log('   (City stats RPC not available, checking manually...)');
    
    const { data: citiesData } = await supabase
      .from('crime_incidents')
      .select('city, state');
    
    if (citiesData) {
      const cityMap = new Map<string, number>();
      for (const row of citiesData as any[]) {
        const key = `${row.city}, ${row.state}`;
        cityMap.set(key, (cityMap.get(key) || 0) + 1);
      }
      
      console.log(`   Cities with data: ${cityMap.size}`);
      
      if (verbose) {
        const sorted = Array.from(cityMap.entries()).sort((a, b) => b[1] - a[1]);
        console.log('\n   Top 10 cities by record count:');
        for (const [city, count] of sorted.slice(0, 10)) {
          console.log(`     ${city}: ${count.toLocaleString()}`);
        }
      }
    }
  } else {
    console.log(`   Cities with data: ${cityStats.length}`);
  }
  
  // 2. Check for records without case_number (non-dedupable)
  console.log('\n2. DEDUPLICATION STATUS');
  console.log('-'.repeat(50));
  
  const { count: withCaseNumber } = await supabase
    .from('crime_incidents')
    .select('*', { count: 'exact', head: true })
    .not('case_number', 'is', null);
  
  const { count: withoutCaseNumber } = await supabase
    .from('crime_incidents')
    .select('*', { count: 'exact', head: true })
    .is('case_number', null);
  
  console.log(`   With case_number (dedupable): ${(withCaseNumber || 0).toLocaleString()}`);
  console.log(`   Without case_number (not dedupable): ${(withoutCaseNumber || 0).toLocaleString()}`);
  
  const pctDedupable = totalIncidents ? ((withCaseNumber || 0) / totalIncidents * 100).toFixed(1) : '0';
  console.log(`   Deduplication coverage: ${pctDedupable}%`);
  
  // 3. Check rolling window data
  console.log('\n3. ROLLING WINDOW DATA (health_metric_data)');
  console.log('-'.repeat(50));
  
  let rolling12mo = 0;
  let rolling36mo = 0;
  
  const { data: crimeMetrics } = await supabase
    .from('health_metrics')
    .select('id, metric_key')
    .in('metric_key', ['assault_rate', 'theft_rate', 'robbery_rate', 'burglary_rate', 'vehicle_theft_rate']);
  
  if (crimeMetrics && crimeMetrics.length > 0) {
    const metricIds = (crimeMetrics as any[]).map(m => m.id);
    
    // Check 12mo rolling
    const { count: count12mo } = await supabase
      .from('health_metric_data')
      .select('*', { count: 'exact', head: true })
      .in('metric_id', metricIds)
      .eq('data_period', '12mo_rolling');
    rolling12mo = count12mo || 0;
    
    // Check 36mo rolling
    const { count: count36mo } = await supabase
      .from('health_metric_data')
      .select('*', { count: 'exact', head: true })
      .in('metric_id', metricIds)
      .eq('data_period', '36mo_rolling');
    rolling36mo = count36mo || 0;
    
    console.log(`   12-month rolling records: ${rolling12mo.toLocaleString()}`);
    console.log(`   36-month rolling records: ${rolling36mo.toLocaleString()}`);
    
    if (rolling12mo === 0) {
      console.log('\n   ⚠️  No 12-month rolling data found!');
      console.log('   Run: npx tsx scripts/refresh-crime-rolling-windows.ts');
    }
  } else {
    console.log('   ⚠️  No crime metrics found in health_metrics table');
  }
  
  // 4. Check for potential data quality issues
  console.log('\n4. DATA QUALITY CHECKS');
  console.log('-'.repeat(50));
  
  // Check for records with null locations
  const { count: noLocation } = await supabase
    .from('crime_incidents')
    .select('*', { count: 'exact', head: true })
    .is('location', null);
  
  const pctNoLocation = totalIncidents ? ((noLocation || 0) / totalIncidents * 100).toFixed(1) : '0';
  console.log(`   Records missing location: ${(noLocation || 0).toLocaleString()} (${pctNoLocation}%)`);
  
  // Check for records with null normalized_type
  const { count: noNormalized } = await supabase
    .from('crime_incidents')
    .select('*', { count: 'exact', head: true })
    .is('normalized_type', null);
  
  const pctNoNormalized = totalIncidents ? ((noNormalized || 0) / totalIncidents * 100).toFixed(1) : '0';
  console.log(`   Records missing normalized_type: ${(noNormalized || 0).toLocaleString()} (${pctNoNormalized}%)`);
  
  // Check for old data (> 36 months)
  const cutoff36mo = new Date();
  cutoff36mo.setMonth(cutoff36mo.getMonth() - 36);
  
  const { count: oldRecords } = await supabase
    .from('crime_incidents')
    .select('*', { count: 'exact', head: true })
    .lt('incident_date', cutoff36mo.toISOString());
  
  const pctOld = totalIncidents ? ((oldRecords || 0) / totalIncidents * 100).toFixed(1) : '0';
  console.log(`   Records older than 36 months: ${(oldRecords || 0).toLocaleString()} (${pctOld}%)`);
  
  // 5. Recommendations
  console.log('\n5. RECOMMENDATIONS');
  console.log('-'.repeat(50));
  
  if ((withoutCaseNumber || 0) > 0) {
    console.log('   • Some records lack case_number - these cannot be deduplicated');
    console.log('     Consider generating synthetic IDs from source data');
  }
  
  if ((rolling12mo || 0) === 0 || (rolling36mo || 0) === 0) {
    console.log('   • Run rolling window refresh to generate aggregated crime rates:');
    console.log('     npx tsx scripts/refresh-crime-rolling-windows.ts');
  }
  
  if ((noLocation || 0) > (totalIncidents || 1) * 0.1) {
    console.log('   • >10% records missing location - consider geocoding these');
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('Health check complete');
  console.log('='.repeat(70));
}

main().catch(console.error);
