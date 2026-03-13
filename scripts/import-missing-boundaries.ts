import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('=== Importing Missing Boundaries ===\n');

  // Read the missing boundaries file
  const missingData = JSON.parse(readFileSync('scripts/missing-boundaries.json', 'utf-8'));
  
  console.log(`Found ${missingData.count} boundaries to import\n`);

  const batchSize = 50;
  let totalInserted = 0;
  let totalErrors = 0;

  for (let i = 0; i < missingData.boundaries.length; i += batchSize) {
    const batch = missingData.boundaries.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(missingData.boundaries.length / batchSize);
    
    console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} boundaries)...`);

    // Use RPC function to bulk import
    const { data, error } = await supabase.rpc('fn_import_boundaries', {
      boundaries_data: batch
    });

    if (error) {
      console.error(`  Error:`, error.message);
      
      // Try inserting one by one as fallback
      for (const boundary of batch) {
        const { error: singleError } = await supabase
          .from('boundaries')
          .insert({
            external_id: boundary.external_id,
            name: boundary.name,
            type: boundary.type,
            geometry: boundary.geometry,
            source: boundary.source
          });
        
        if (singleError) {
          console.log(`    Failed: ${boundary.name} - ${singleError.message}`);
          totalErrors++;
        } else {
          totalInserted++;
        }
      }
    } else {
      const result = data as any;
      console.log(`  Inserted: ${result?.inserted || batch.length}`);
      totalInserted += result?.inserted || batch.length;
      totalErrors += result?.errors || 0;
    }
  }

  console.log('\n=== Import Complete ===');
  console.log(`Total inserted: ${totalInserted}`);
  console.log(`Total errors: ${totalErrors}`);

  // Verify Grand Rapids charter township was imported
  const { data: grCheck } = await supabase
    .from('boundaries')
    .select('id, name, type')
    .ilike('name', '%grand rapids charter%');
  
  if (grCheck && grCheck.length > 0) {
    console.log('\n✓ Grand Rapids charter township successfully imported!');
    console.log('  ID:', grCheck[0].id);
  } else {
    console.log('\n✗ Grand Rapids charter township NOT found after import');
  }
}

main().catch(console.error);
