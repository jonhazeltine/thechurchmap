#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!supabaseUrl || !supabaseKey) { console.error('Missing env vars'); process.exit(1); }
const supabase = createClient(supabaseUrl, supabaseKey);

const MICHIGAN_FIPS = '26';
const TIGERWEB_BASE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer';
const PLACES_LAYER = 28;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== Recover Michigan Place Boundaries ===\n');

  const places: any[] = [];
  let offset = 0;
  const batchSize = 100;
  let hasMore = true;

  console.log('Fetching all Michigan places from TIGERweb...');
  while (hasMore) {
    const params = new URLSearchParams({
      where: `STATE='${MICHIGAN_FIPS}'`,
      outFields: 'NAME,GEOID',
      f: 'geojson',
      resultOffset: String(offset),
      resultRecordCount: String(batchSize),
      outSR: '4326',
    });
    const res = await fetch(`${TIGERWEB_BASE}/${PLACES_LAYER}/query?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.features || data.features.length === 0) { hasMore = false; continue; }
    for (const f of data.features) {
      if (f.properties?.NAME && f.properties?.GEOID && f.geometry) {
        places.push({ name: f.properties.NAME, geoid: f.properties.GEOID, geometry: f.geometry });
      }
    }
    process.stdout.write(`  ${places.length} places fetched...\r`);
    if (data.features.length < batchSize) { hasMore = false; } else { offset += batchSize; await sleep(200); }
  }
  console.log(`\nTotal Michigan places from TIGERweb: ${places.length}\n`);

  const importBatch = 5;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (let i = 0; i < places.length; i += importBatch) {
    const batch = places.slice(i, i + importBatch);
    const batchNum = Math.floor(i / importBatch) + 1;
    const totalBatches = Math.ceil(places.length / importBatch);

    const boundariesData = batch.map((p: any) => ({
      external_id: p.geoid,
      name: p.name,
      type: 'place',
      geometry: JSON.stringify(p.geometry),
      source: 'tigerweb_recovery',
      state_fips: MICHIGAN_FIPS,
    }));

    process.stdout.write(`  Batch ${batchNum}/${totalBatches}...`);

    try {
      const { data, error } = await supabase.rpc('fn_import_boundaries', {
        boundaries_data: boundariesData,
      });

      if (error) {
        console.log(` ERROR: ${error.message.substring(0, 80)}`);
        totalErrors += batch.length;
        continue;
      }

      const ins = data?.inserted || 0;
      const upd = data?.updated || 0;
      const err = data?.errors || 0;
      console.log(` +${ins} ~${upd} !${err}`);
      totalInserted += ins;
      totalUpdated += upd;
      totalErrors += err;
    } catch (err: any) {
      console.log(` FAILED: ${err.message}`);
      totalErrors += batch.length;
    }
  }

  console.log('\n=== Recovery Complete ===');
  console.log(`New inserts: ${totalInserted}`);
  console.log(`Updated existing: ${totalUpdated}`);
  console.log(`Errors: ${totalErrors}`);

  console.log('\nVerifying Grand Rapids...');
  const { data: grData } = await supabase
    .from('boundaries')
    .select('id, name, type, external_id, state_fips')
    .ilike('name', '%grand rapids%')
    .eq('type', 'place')
    .order('name');

  if (grData) {
    for (const b of grData) {
      console.log(`  ${b.name} | ext: ${b.external_id} | state_fips: ${b.state_fips}`);
    }
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
