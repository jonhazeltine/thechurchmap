#!/usr/bin/env npx tsx
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!supabaseUrl || !supabaseKey) { console.error('Missing env vars'); process.exit(1); }
const supabase = createClient(supabaseUrl, supabaseKey);

const startFrom = parseInt(process.argv[2] || '0', 10);

async function main() {
  const places = JSON.parse(readFileSync('/tmp/mi-places.json', 'utf-8'));
  console.log(`Total places: ${places.length}, starting from index ${startFrom}\n`);

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (let i = startFrom; i < places.length; i++) {
    const p = places[i];
    const boundaryData = [{
      external_id: p.external_id,
      name: p.name,
      type: p.type,
      geometry: JSON.stringify(p.geometry),
      source: p.source,
      state_fips: p.state_fips,
    }];

    process.stdout.write(`  [${i + 1}/${places.length}] ${p.name}...`);

    try {
      const { data, error } = await supabase.rpc('fn_import_boundaries', {
        boundaries_data: boundaryData,
      });

      if (error) {
        console.log(` ERROR: ${error.message.substring(0, 60)}`);
        totalErrors++;
        continue;
      }

      const ins = data?.inserted || 0;
      const upd = data?.updated || 0;
      if (ins > 0) { console.log(` INSERTED`); totalInserted += ins; }
      else if (upd > 0) { console.log(` exists (updated)`); totalUpdated += upd; }
      else { console.log(` ok`); }
    } catch (err: any) {
      console.log(` FAILED: ${err.message}`);
      totalErrors++;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Inserted: ${totalInserted}, Updated: ${totalUpdated}, Errors: ${totalErrors}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
