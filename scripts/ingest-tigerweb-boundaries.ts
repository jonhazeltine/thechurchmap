#!/usr/bin/env npx tsx
/**
 * TIGERweb Michigan Boundary Ingestion Script
 * 
 * Fetches boundary data from US Census TIGERweb REST API for Michigan:
 * - Counties (Layer 84 from tigerWMS_Current)
 * - Census Tracts (Layer 8 from tigerWMS_Current)
 * - ZIP Code Tabulation Areas (Layer 2 from tigerWMS_Current - labeled as ZCTA5)
 * - Incorporated Places / Cities (Layer 28 from tigerWMS_Current)
 * - County Subdivisions / Townships (Layer 24 from tigerWMS_Current)
 * 
 * Usage: npx tsx scripts/ingest-tigerweb-boundaries.ts [--type county|tract|zip|place|township|all]
 * 
 * Michigan FIPS: 26
 */

const MICHIGAN_FIPS = '26';
const TIGERWEB_BASE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer';

const API_BASE = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : 'http://localhost:5000';

// TIGERweb layer IDs for tigerWMS_Current MapServer
const LAYERS = {
  counties: { id: 84, type: 'county', stateField: 'STATE', nameField: 'NAME', geoidField: 'GEOID' },
  tracts: { id: 8, type: 'census_tract', stateField: 'STATE', nameField: 'NAME', geoidField: 'GEOID' },
  zctas: { id: 2, type: 'zip', stateField: null, nameField: 'ZCTA5CE20', geoidField: 'GEOID20' }, // ZCTAs don't have state field in some layers
  places: { id: 28, type: 'place', stateField: 'STATE', nameField: 'NAME', geoidField: 'GEOID' },
  cousubs: { id: 24, type: 'township', stateField: 'STATE', nameField: 'NAME', geoidField: 'GEOID' },
};

interface BoundaryRecord {
  external_id: string;
  name: string;
  type: string;
  geometry: string; // JSON string
  source: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchLayerFeatures(
  layerId: number,
  stateField: string | null,
  nameField: string,
  geoidField: string,
  boundaryType: string
): Promise<BoundaryRecord[]> {
  const boundaries: BoundaryRecord[] = [];
  let offset = 0;
  const batchSize = 100; // TIGERweb typically limits to 1000, but use smaller for reliability
  let hasMore = true;
  
  // Build WHERE clause - for ZCTAs we need a different approach since they span states
  let whereClause: string;
  if (stateField) {
    whereClause = `${stateField}='${MICHIGAN_FIPS}'`;
  } else if (boundaryType === 'zip') {
    // For ZCTAs, filter by Michigan ZIPs (start with 48, 49, or occasionally 49xxx)
    // Michigan ZIPs: 48001-49971
    whereClause = `(ZCTA5CE20 LIKE '48%' OR ZCTA5CE20 LIKE '49%')`;
  } else {
    whereClause = '1=1';
  }
  
  console.log(`\nFetching ${boundaryType} boundaries from layer ${layerId}...`);
  console.log(`  WHERE: ${whereClause}`);
  
  while (hasMore) {
    const params = new URLSearchParams({
      where: whereClause,
      outFields: `${nameField},${geoidField}`,
      f: 'geojson',
      resultOffset: String(offset),
      resultRecordCount: String(batchSize),
      outSR: '4326', // WGS84 for standard lat/lng
    });
    
    const url = `${TIGERWEB_BASE}/${layerId}/query?${params.toString()}`;
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`  API error: ${response.status} ${response.statusText}`);
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.features || data.features.length === 0) {
        hasMore = false;
        continue;
      }
      
      for (const feature of data.features) {
        const props = feature.properties;
        const name = props[nameField];
        const geoid = props[geoidField];
        
        if (!name || !geoid || !feature.geometry) {
          continue;
        }
        
        boundaries.push({
          external_id: geoid,
          name: name,
          type: boundaryType,
          geometry: JSON.stringify(feature.geometry),
          source: 'tigerweb_2024',
        });
      }
      
      console.log(`  Fetched ${boundaries.length} ${boundaryType} boundaries so far...`);
      
      if (data.features.length < batchSize) {
        hasMore = false;
      } else {
        offset += batchSize;
        // Be nice to the API
        await sleep(200);
      }
      
    } catch (error: any) {
      console.error(`  Error fetching batch at offset ${offset}:`, error.message);
      // Try to continue with next batch
      offset += batchSize;
      await sleep(1000);
    }
  }
  
  return boundaries;
}

async function importBoundaries(boundaries: BoundaryRecord[], boundaryType: string): Promise<{ inserted: number; errors: number }> {
  const batchSize = 10; // Small batch due to large geometry payloads
  let totalInserted = 0;
  let totalErrors = 0;
  
  console.log(`\nImporting ${boundaries.length} ${boundaryType} boundaries to database...`);
  
  for (let i = 0; i < boundaries.length; i += batchSize) {
    const batch = boundaries.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(boundaries.length / batchSize);
    
    process.stdout.write(`  Batch ${batchNum}/${totalBatches}...`);
    
    try {
      const response = await fetch(`${API_BASE}/api/boundaries/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ boundaries: batch }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(` ✗ HTTP ${response.status}: ${errorText.substring(0, 100)}`);
        totalErrors += batch.length;
        continue;
      }
      
      const result = await response.json();
      console.log(` ✓ Inserted: ${result.inserted}, Errors: ${result.errors}`);
      totalInserted += result.inserted || 0;
      totalErrors += result.errors || 0;
      
    } catch (error: any) {
      console.error(` ✗ Request failed:`, error.message);
      totalErrors += batch.length;
    }
    
    // Rate limit
    await sleep(100);
  }
  
  return { inserted: totalInserted, errors: totalErrors };
}

async function ingestBoundaryType(typeKey: keyof typeof LAYERS): Promise<{ fetched: number; inserted: number; errors: number }> {
  const layer = LAYERS[typeKey];
  
  const boundaries = await fetchLayerFeatures(
    layer.id,
    layer.stateField,
    layer.nameField,
    layer.geoidField,
    layer.type
  );
  
  if (boundaries.length === 0) {
    console.log(`  No ${layer.type} boundaries found.`);
    return { fetched: 0, inserted: 0, errors: 0 };
  }
  
  const result = await importBoundaries(boundaries, layer.type);
  
  return {
    fetched: boundaries.length,
    inserted: result.inserted,
    errors: result.errors,
  };
}

async function main() {
  const args = process.argv.slice(2);
  let typeArg = 'all';
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) {
      typeArg = args[i + 1].toLowerCase();
    }
  }
  
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     TIGERweb Michigan Boundary Ingestion Script            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`API Base: ${API_BASE}`);
  console.log(`Target State: Michigan (FIPS ${MICHIGAN_FIPS})`);
  console.log(`Boundary Type: ${typeArg}`);
  console.log('');
  
  const results: Record<string, { fetched: number; inserted: number; errors: number }> = {};
  
  const typeMap: Record<string, (keyof typeof LAYERS)[]> = {
    'county': ['counties'],
    'counties': ['counties'],
    'tract': ['tracts'],
    'tracts': ['tracts'],
    'census_tract': ['tracts'],
    'zip': ['zctas'],
    'zcta': ['zctas'],
    'place': ['places'],
    'places': ['places'],
    'city': ['places'],
    'township': ['cousubs'],
    'cousub': ['cousubs'],
    'all': ['counties', 'tracts', 'zctas', 'places', 'cousubs'],
  };
  
  const typesToProcess = typeMap[typeArg];
  
  if (!typesToProcess) {
    console.error(`Unknown boundary type: ${typeArg}`);
    console.error('Valid types: county, tract, zip, place, township, all');
    process.exit(1);
  }
  
  for (const typeKey of typesToProcess) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing: ${typeKey.toUpperCase()}`);
    console.log('='.repeat(60));
    
    try {
      results[typeKey] = await ingestBoundaryType(typeKey);
    } catch (error: any) {
      console.error(`Failed to process ${typeKey}:`, error.message);
      results[typeKey] = { fetched: 0, inserted: 0, errors: 1 };
    }
  }
  
  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('                    INGESTION SUMMARY');
  console.log('═'.repeat(60));
  
  let totalFetched = 0;
  let totalInserted = 0;
  let totalErrors = 0;
  
  for (const [typeKey, result] of Object.entries(results)) {
    const layer = LAYERS[typeKey as keyof typeof LAYERS];
    console.log(`\n${layer.type.toUpperCase()}:`);
    console.log(`  Fetched:  ${result.fetched}`);
    console.log(`  Inserted: ${result.inserted}`);
    console.log(`  Errors:   ${result.errors}`);
    
    totalFetched += result.fetched;
    totalInserted += result.inserted;
    totalErrors += result.errors;
  }
  
  console.log('\n' + '-'.repeat(60));
  console.log('TOTALS:');
  console.log(`  Total Fetched:  ${totalFetched}`);
  console.log(`  Total Inserted: ${totalInserted}`);
  console.log(`  Total Errors:   ${totalErrors}`);
  console.log(`  Success Rate:   ${totalFetched > 0 ? ((totalInserted / totalFetched) * 100).toFixed(1) : 0}%`);
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
