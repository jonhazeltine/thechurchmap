import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables:');
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? 'present' : 'MISSING');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'present' : 'MISSING');
  process.exit(1);
}

console.log('Connecting to Supabase...');
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function importPlaces() {
  console.log('Reading GeoJSON file...');
  const geojsonPath = 'attached_assets/tl_2025_26_place_1763823672270.json';
  const geojsonData = JSON.parse(readFileSync(geojsonPath, 'utf-8'));
  
  if (geojsonData.type !== 'FeatureCollection') {
    throw new Error('Invalid GeoJSON: expected FeatureCollection');
  }
  
  console.log(`Found ${geojsonData.features.length} features`);
  
  const boundaries = geojsonData.features.map((feature: any) => ({
    external_id: feature.properties.GEOID,
    name: feature.properties.NAME,
    type: 'place',
    geometry: JSON.stringify(feature.geometry),
    source: 'census_2025'
  }));
  
  console.log(`Prepared ${boundaries.length} boundaries for import`);
  console.log('Sample boundary:', boundaries[0]);
  
  const batchSize = 100;
  let totalInserted = 0;
  let totalErrors = 0;
  
  for (let i = 0; i < boundaries.length; i += batchSize) {
    const batch = boundaries.slice(i, i + batchSize);
    console.log(`Importing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(boundaries.length / batchSize)} (${batch.length} records)...`);
    
    const { data, error } = await supabase.rpc('fn_import_boundaries', {
      boundaries_data: batch
    });
    
    if (error) {
      console.error(`Error importing batch:`, error);
      totalErrors += batch.length;
    } else {
      console.log(`Batch result:`, data);
      totalInserted += data.inserted;
      totalErrors += data.errors;
    }
  }
  
  console.log('\n=== Import Complete ===');
  console.log(`Total inserted: ${totalInserted}`);
  console.log(`Total errors: ${totalErrors}`);
  
  const { count, error: countError } = await supabase
    .from('boundaries')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'place')
    .eq('source', 'census_2025');
  
  if (!countError) {
    console.log(`Verified count in database: ${count} place boundaries`);
  }
  
  const { data: sampleData } = await supabase
    .from('boundaries')
    .select('id, name, type, source, external_id')
    .eq('type', 'place')
    .eq('source', 'census_2025')
    .limit(5);
  
  console.log('\nSample records from database:');
  console.table(sampleData);
}

importPlaces()
  .then(() => {
    console.log('\nImport script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Import failed:', error);
    process.exit(1);
  });
