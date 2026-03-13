/**
 * Crime Data Geographic Label Audit
 * 
 * This script validates that crime incident coordinates actually fall within
 * the city they claim to be from. Catches mislabeled data like the Atlanta/DC mixup.
 * 
 * Usage:
 *   npx tsx scripts/audit-crime-geo-labels.ts
 *   npx tsx scripts/audit-crime-geo-labels.ts --city "Atlanta"
 *   npx tsx scripts/audit-crime-geo-labels.ts --fix  # Delete mismatched records
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// City bounding boxes [minLng, minLat, maxLng, maxLat]
// These are approximate metro area bounds
const CITY_BOUNDS: Record<string, [number, number, number, number]> = {
  // CALIFORNIA
  'Los Angeles,CA': [-118.7, 33.7, -117.6, 34.4],
  'San Francisco,CA': [-122.55, 37.65, -122.3, 37.85],
  'Oakland,CA': [-122.35, 37.7, -122.1, 37.9],
  'San Diego,CA': [-117.3, 32.5, -116.9, 33.2],
  'Sacramento,CA': [-121.6, 38.4, -121.2, 38.7],
  
  // TEXAS
  'Dallas,TX': [-97.1, 32.6, -96.5, 33.1],
  'Houston,TX': [-95.8, 29.5, -95.0, 30.2],
  'Austin,TX': [-98.0, 30.1, -97.5, 30.6],
  'San Antonio,TX': [-98.7, 29.2, -98.2, 29.7],
  'Fort Worth,TX': [-97.6, 32.5, -97.1, 32.95],
  
  // ILLINOIS
  'Chicago,IL': [-88.0, 41.6, -87.5, 42.1],
  
  // NEW YORK
  'New York City,NY': [-74.3, 40.5, -73.7, 40.95],
  'Buffalo,NY': [-79.0, 42.8, -78.7, 43.0],
  
  // WASHINGTON
  'Seattle,WA': [-122.5, 47.4, -122.2, 47.75],
  
  // LOUISIANA
  'New Orleans,LA': [-90.2, 29.85, -89.85, 30.1],
  'Baton Rouge,LA': [-91.3, 30.3, -90.9, 30.6],
  
  // TENNESSEE
  'Memphis,TN': [-90.2, 34.95, -89.8, 35.25],
  'Nashville,TN': [-87.1, 35.95, -86.5, 36.4],
  'Chattanooga,TN': [-85.4, 34.95, -85.1, 35.15],
  
  // MISSOURI
  'Kansas City,MO': [-94.8, 38.85, -94.4, 39.35],
  
  // HAWAII
  'Honolulu,HI': [-158.0, 21.25, -157.7, 21.45],
  
  // OHIO
  'Cincinnati,OH': [-84.7, 39.0, -84.3, 39.25],
  'Cleveland,OH': [-81.9, 41.35, -81.5, 41.6],
  
  // RHODE ISLAND
  'Providence,RI': [-71.5, 41.75, -71.35, 41.9],
  
  // ARKANSAS
  'Little Rock,AR': [-92.5, 34.65, -92.1, 34.85],
  
  // VIRGINIA
  'Norfolk,VA': [-76.4, 36.8, -76.15, 36.95],
  'Virginia Beach,VA': [-76.2, 36.7, -75.9, 36.95],
  
  // FLORIDA
  'Orlando,FL': [-81.55, 28.35, -81.2, 28.65],
  'Fort Lauderdale,FL': [-80.3, 26.05, -80.05, 26.25],
  
  // MARYLAND
  'Montgomery County,MD': [-77.5, 38.9, -76.9, 39.35],
  'Baltimore,MD': [-76.75, 39.2, -76.5, 39.4],
  
  // GEORGIA
  'Atlanta,GA': [-84.6, 33.6, -84.2, 34.0],
  
  // MICHIGAN
  'Detroit,MI': [-83.3, 42.25, -82.9, 42.5],
  'Grand Rapids,MI': [-85.8, 42.85, -85.5, 43.1],
  
  // COLORADO
  'Denver,CO': [-105.15, 39.6, -104.75, 39.95],
  
  // NORTH CAROLINA
  'Charlotte,NC': [-81.0, 35.0, -80.6, 35.45],
  'Raleigh,NC': [-78.85, 35.65, -78.5, 35.95],
  
  // INDIANA
  'Indianapolis,IN': [-86.35, 39.6, -85.95, 39.95],
  
  // NEVADA
  'Las Vegas,NV': [-115.4, 35.95, -114.9, 36.35],
  
  // DC
  'Washington,DC': [-77.15, 38.8, -76.9, 39.0],
  
  // MINNESOTA
  'Minneapolis,MN': [-93.4, 44.85, -93.15, 45.1],
  
  // KENTUCKY
  'Louisville,KY': [-85.9, 38.1, -85.5, 38.4],
  
  // NEW MEXICO
  'Albuquerque,NM': [-106.8, 34.95, -106.4, 35.25],
  
  // SOUTH CAROLINA
  'Charleston,SC': [-80.15, 32.7, -79.85, 32.95],
  
  // ARIZONA
  'Phoenix,AZ': [-112.4, 33.25, -111.8, 33.75],
  'Tucson,AZ': [-111.1, 32.1, -110.75, 32.35],
  'Tempe,AZ': [-111.98, 33.35, -111.85, 33.5],
  
  // IDAHO
  'Boise,ID': [-116.35, 43.5, -116.1, 43.7],
  
  // NEBRASKA
  'Omaha,NE': [-96.2, 41.15, -95.85, 41.35],
  
  // OKLAHOMA
  'Tulsa,OK': [-96.15, 35.95, -95.75, 36.25],
  
  // ALASKA
  'Anchorage,AK': [-150.1, 61.05, -149.7, 61.35],
  
  // WISCONSIN
  'Milwaukee,WI': [-88.1, 42.9, -87.85, 43.2],
  
  // PENNSYLVANIA
  'Pittsburgh,PA': [-80.15, 40.35, -79.85, 40.55],
  'Philadelphia,PA': [-75.3, 39.85, -74.95, 40.15],
};

interface AuditResult {
  city: string;
  state: string;
  totalRecords: number;
  sampledRecords: number;
  recordsWithCoords: number;
  recordsInBounds: number;
  recordsOutOfBounds: number;
  outOfBoundsPercent: number;
  status: 'OK' | 'WARNING' | 'CRITICAL' | 'NO_COORDS' | 'UNKNOWN_BOUNDS';
  sampleOutOfBounds?: Array<{ lat: number; lng: number; date: string }>;
}

async function auditCity(city: string, state: string): Promise<AuditResult> {
  const key = `${city},${state}`;
  const bounds = CITY_BOUNDS[key];
  
  // Get total count
  const { count: totalRecords } = await supabase
    .from('crime_incidents')
    .select('*', { count: 'exact', head: true })
    .eq('city', city)
    .eq('state', state);
  
  if (!totalRecords || totalRecords === 0) {
    return {
      city,
      state,
      totalRecords: 0,
      sampledRecords: 0,
      recordsWithCoords: 0,
      recordsInBounds: 0,
      recordsOutOfBounds: 0,
      outOfBoundsPercent: 0,
      status: 'OK',
    };
  }
  
  if (!bounds) {
    return {
      city,
      state,
      totalRecords: totalRecords || 0,
      sampledRecords: 0,
      recordsWithCoords: 0,
      recordsInBounds: 0,
      recordsOutOfBounds: 0,
      outOfBoundsPercent: 0,
      status: 'UNKNOWN_BOUNDS',
    };
  }
  
  // Sample up to 1000 records with coordinates
  const { data: samples, error } = await supabase
    .from('crime_incidents')
    .select('latitude, longitude, incident_date')
    .eq('city', city)
    .eq('state', state)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .limit(1000);
  
  if (error || !samples) {
    console.error(`  Error fetching samples for ${city}, ${state}:`, error);
    return {
      city,
      state,
      totalRecords: totalRecords || 0,
      sampledRecords: 0,
      recordsWithCoords: 0,
      recordsInBounds: 0,
      recordsOutOfBounds: 0,
      outOfBoundsPercent: 0,
      status: 'NO_COORDS',
    };
  }
  
  if (samples.length === 0) {
    return {
      city,
      state,
      totalRecords: totalRecords || 0,
      sampledRecords: 0,
      recordsWithCoords: 0,
      recordsInBounds: 0,
      recordsOutOfBounds: 0,
      outOfBoundsPercent: 0,
      status: 'NO_COORDS',
    };
  }
  
  const [minLng, minLat, maxLng, maxLat] = bounds;
  
  let inBounds = 0;
  let outOfBounds = 0;
  const outOfBoundsSamples: Array<{ lat: number; lng: number; date: string }> = [];
  
  for (const record of samples) {
    const lat = parseFloat(record.latitude);
    const lng = parseFloat(record.longitude);
    
    if (isNaN(lat) || isNaN(lng)) continue;
    
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
      inBounds++;
    } else {
      outOfBounds++;
      if (outOfBoundsSamples.length < 5) {
        outOfBoundsSamples.push({
          lat,
          lng,
          date: record.incident_date || 'unknown',
        });
      }
    }
  }
  
  const total = inBounds + outOfBounds;
  const outOfBoundsPercent = total > 0 ? (outOfBounds / total) * 100 : 0;
  
  let status: AuditResult['status'] = 'OK';
  if (outOfBoundsPercent > 50) {
    status = 'CRITICAL'; // Majority of data is wrong city!
  } else if (outOfBoundsPercent > 10) {
    status = 'WARNING';
  }
  
  return {
    city,
    state,
    totalRecords: totalRecords || 0,
    sampledRecords: samples.length,
    recordsWithCoords: total,
    recordsInBounds: inBounds,
    recordsOutOfBounds: outOfBounds,
    outOfBoundsPercent,
    status,
    sampleOutOfBounds: outOfBoundsSamples.length > 0 ? outOfBoundsSamples : undefined,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const cityFlag = args.indexOf('--city');
  const specificCity = cityFlag !== -1 ? args[cityFlag + 1] : null;
  const fixMode = args.includes('--fix');
  
  console.log('============================================================');
  console.log('Crime Data Geographic Label Audit');
  console.log('============================================================');
  console.log('');
  
  // Get all cities from the database
  const { data: cities, error } = await supabase
    .from('crime_incidents')
    .select('city, state')
    .not('city', 'is', null)
    .not('state', 'is', null);
  
  if (error) {
    console.error('Error fetching cities:', error);
    process.exit(1);
  }
  
  // Get unique city/state pairs
  const uniqueCities = new Map<string, { city: string; state: string }>();
  for (const row of cities || []) {
    const key = `${row.city},${row.state}`;
    if (!uniqueCities.has(key)) {
      uniqueCities.set(key, { city: row.city, state: row.state });
    }
  }
  
  console.log(`Found ${uniqueCities.size} unique cities in database\n`);
  
  const results: AuditResult[] = [];
  const citiesToAudit = specificCity
    ? Array.from(uniqueCities.values()).filter(c => 
        c.city.toLowerCase() === specificCity.toLowerCase()
      )
    : Array.from(uniqueCities.values());
  
  for (const { city, state } of citiesToAudit) {
    process.stdout.write(`Auditing ${city}, ${state}...`);
    const result = await auditCity(city, state);
    results.push(result);
    
    if (result.status === 'CRITICAL') {
      console.log(` ❌ CRITICAL - ${result.outOfBoundsPercent.toFixed(1)}% out of bounds!`);
    } else if (result.status === 'WARNING') {
      console.log(` ⚠️  WARNING - ${result.outOfBoundsPercent.toFixed(1)}% out of bounds`);
    } else if (result.status === 'UNKNOWN_BOUNDS') {
      console.log(` ❓ No bounding box defined`);
    } else if (result.status === 'NO_COORDS') {
      console.log(` 📍 No coordinates in data`);
    } else {
      console.log(` ✅ OK (${result.recordsInBounds}/${result.recordsWithCoords} in bounds)`);
    }
  }
  
  // Summary
  console.log('\n============================================================');
  console.log('Summary');
  console.log('============================================================\n');
  
  const critical = results.filter(r => r.status === 'CRITICAL');
  const warnings = results.filter(r => r.status === 'WARNING');
  const ok = results.filter(r => r.status === 'OK');
  const noCoords = results.filter(r => r.status === 'NO_COORDS');
  const unknownBounds = results.filter(r => r.status === 'UNKNOWN_BOUNDS');
  
  console.log(`Total cities audited: ${results.length}`);
  console.log(`  ✅ OK: ${ok.length}`);
  console.log(`  ⚠️  Warnings: ${warnings.length}`);
  console.log(`  ❌ Critical: ${critical.length}`);
  console.log(`  📍 No coordinates: ${noCoords.length}`);
  console.log(`  ❓ Unknown bounds: ${unknownBounds.length}`);
  
  if (critical.length > 0) {
    console.log('\n❌ CRITICAL ISSUES (likely mislabeled data):');
    for (const r of critical) {
      console.log(`\n  ${r.city}, ${r.state}:`);
      console.log(`    Total records: ${r.totalRecords.toLocaleString()}`);
      console.log(`    Out of bounds: ${r.recordsOutOfBounds}/${r.recordsWithCoords} (${r.outOfBoundsPercent.toFixed(1)}%)`);
      if (r.sampleOutOfBounds) {
        console.log('    Sample coordinates that are out of bounds:');
        for (const s of r.sampleOutOfBounds) {
          console.log(`      [${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}] - ${s.date}`);
        }
      }
    }
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS (some data may be mislabeled):');
    for (const r of warnings) {
      console.log(`  ${r.city}, ${r.state}: ${r.outOfBoundsPercent.toFixed(1)}% out of bounds`);
    }
  }
  
  if (unknownBounds.length > 0) {
    console.log('\n❓ Cities without defined bounding boxes:');
    for (const r of unknownBounds) {
      console.log(`  ${r.city}, ${r.state}: ${r.totalRecords.toLocaleString()} records`);
    }
  }
  
  if (fixMode && critical.length > 0) {
    console.log('\n\n🔧 FIX MODE: Deleting mislabeled records...');
    for (const r of critical) {
      console.log(`  Deleting ${r.city}, ${r.state} records...`);
      const { error: deleteError, count } = await supabase
        .from('crime_incidents')
        .delete()
        .eq('city', r.city)
        .eq('state', r.state);
      
      if (deleteError) {
        console.log(`    ❌ Error: ${deleteError.message}`);
      } else {
        console.log(`    ✅ Deleted ${count || 'all'} records`);
      }
    }
  }
  
  console.log('\n============================================================');
  console.log('Audit complete!');
  console.log('============================================================');
}

main().catch(console.error);
