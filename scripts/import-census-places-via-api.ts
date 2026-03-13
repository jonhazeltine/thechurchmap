import { readFileSync } from 'fs';

const API_BASE = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : 'http://localhost:5000';

async function importPlaces() {
  console.log('Reading GeoJSON file...');
  const geojsonPath = 'attached_assets/tl_2025_26_place_1763823672270.json';
  const geojsonData = JSON.parse(readFileSync(geojsonPath, 'utf-8'));
  
  if (geojsonData.type !== 'FeatureCollection') {
    throw new Error('Invalid GeoJSON: expected FeatureCollection');
  }
  
  console.log(`Found ${geojsonData.features.length} features`);
  console.log('\nFirst feature sample:');
  console.log('Properties:', JSON.stringify(geojsonData.features[0].properties, null, 2));
  
  const boundaries = geojsonData.features.map((feature: any) => ({
    external_id: feature.properties.GEOID,
    name: feature.properties.NAME,
    type: 'place',
    geometry: JSON.stringify(feature.geometry),
    source: 'census_2025'
  }));
  
  console.log(`\nPrepared ${boundaries.length} boundaries for import`);
  console.log('\nSample boundary object:');
  console.log(JSON.stringify({
    ...boundaries[0],
    geometry: boundaries[0].geometry.substring(0, 100) + '...[truncated]'
  }, null, 2));
  
  const batchSize = 10;
  let totalInserted = 0;
  let totalErrors = 0;
  
  console.log(`\nImporting in batches of ${batchSize}...`);
  console.log(`API endpoint: ${API_BASE}/api/boundaries/import\n`);
  console.log('Note: Using small batch size due to large geometry payloads\n');
  
  for (let i = 0; i < boundaries.length; i += batchSize) {
    const batch = boundaries.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(boundaries.length / batchSize);
    
    console.log(`Batch ${batchNum}/${totalBatches} (${batch.length} records)...`);
    
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
        console.error(`  ✗ HTTP ${response.status}: ${errorText}`);
        totalErrors += batch.length;
        continue;
      }
      
      const result = await response.json();
      console.log(`  ✓ Inserted: ${result.inserted}, Errors: ${result.errors}`);
      totalInserted += result.inserted;
      totalErrors += result.errors;
      
    } catch (error: any) {
      console.error(`  ✗ Request failed:`, error.message);
      totalErrors += batch.length;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('IMPORT COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total inserted: ${totalInserted}`);
  console.log(`Total errors: ${totalErrors}`);
  console.log(`Success rate: ${((totalInserted / boundaries.length) * 100).toFixed(1)}%`);
}

console.log('Census Places Import Script');
console.log('='.repeat(60));
console.log('\nIMPORTANT: Before running this script, execute the following SQL');
console.log('in the Supabase SQL Editor to add "place" to allowed boundary types:\n');
console.log('ALTER TABLE public.boundaries DROP CONSTRAINT IF EXISTS boundaries_type_check;');
console.log('ALTER TABLE public.boundaries ADD CONSTRAINT boundaries_type_check');
console.log('  CHECK (type IN (\'county\',\'city\',\'zip\',\'neighborhood\',\'school_district\',\'place\',\'other\'));');
console.log('\n' + '='.repeat(60) + '\n');

importPlaces()
  .then(() => {
    console.log('\nScript completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });
