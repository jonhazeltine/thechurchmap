#!/usr/bin/env npx tsx
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const isDryRun = process.argv.includes('--dry-run');

const MICHIGAN_FIPS = '26';
const TIGERWEB_BASE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer';
const PLACES_LAYER = 28;

const API_BASE = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : 'http://localhost:5000';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface TigerPlace {
  name: string;
  geoid: string;
  geometry: any;
}

async function fetchAllMichiganPlaces(): Promise<TigerPlace[]> {
  const places: TigerPlace[] = [];
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

    const url = `${TIGERWEB_BASE}/${PLACES_LAYER}/query?${params}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (!data.features || data.features.length === 0) {
        hasMore = false;
        continue;
      }

      for (const f of data.features) {
        if (f.properties?.NAME && f.properties?.GEOID && f.geometry) {
          places.push({
            name: f.properties.NAME,
            geoid: f.properties.GEOID,
            geometry: f.geometry,
          });
        }
      }

      process.stdout.write(`  ${places.length} places fetched...\r`);

      if (data.features.length < batchSize) {
        hasMore = false;
      } else {
        offset += batchSize;
        await sleep(200);
      }
    } catch (err: any) {
      console.error(`  Error at offset ${offset}: ${err.message}`);
      offset += batchSize;
      await sleep(1000);
    }
  }

  console.log(`\nTotal Michigan places from TIGERweb: ${places.length}`);
  return places;
}

async function getExistingPlaceGeoids(): Promise<Set<string>> {
  const geoids = new Set<string>();
  let from = 0;
  const pageSize = 1000;

  console.log('\nFetching existing place boundaries from database...');

  while (true) {
    const { data, error } = await supabase
      .from('boundaries')
      .select('external_id')
      .eq('type', 'place')
      .not('external_id', 'is', null)
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('Error fetching existing boundaries:', error);
      break;
    }

    if (!data || data.length === 0) break;

    for (const b of data) {
      if (b.external_id) geoids.add(b.external_id);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log(`Existing place boundaries in DB: ${geoids.size}`);
  return geoids;
}

async function main() {
  console.log('=== Recover Deleted Place Boundaries ===');
  if (isDryRun) console.log('DRY RUN - no changes will be made\n');
  console.log('');

  const tigerPlaces = await fetchAllMichiganPlaces();
  const existingGeoids = await getExistingPlaceGeoids();

  const missing = tigerPlaces.filter(p => !existingGeoids.has(p.geoid));

  console.log(`\nMissing from database: ${missing.length} out of ${tigerPlaces.length} Michigan places`);

  if (missing.length === 0) {
    console.log('No missing places! Database is complete.');
    return;
  }

  console.log('\nMissing places:');
  for (const p of missing) {
    console.log(`  - ${p.name} (GEOID: ${p.geoid})`);
  }

  if (isDryRun) {
    console.log(`\nDRY RUN complete. ${missing.length} places would be imported.`);
    return;
  }

  console.log(`\nImporting ${missing.length} missing places...`);

  const batchSize = 5;
  let totalInserted = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(missing.length / batchSize);

    const boundaries = batch.map(p => ({
      external_id: p.geoid,
      name: p.name,
      type: 'place',
      geometry: JSON.stringify(p.geometry),
      source: 'tigerweb_recovery',
      state_fips: MICHIGAN_FIPS,
    }));

    process.stdout.write(`  Batch ${batchNum}/${totalBatches}...`);

    try {
      const res = await fetch(`${API_BASE}/api/boundaries/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boundaries }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(` ERROR: ${res.status} - ${errText.substring(0, 100)}`);
        totalErrors += batch.length;
        continue;
      }

      const result = await res.json();
      console.log(` inserted: ${result.inserted || 0}, updated: ${result.updated || 0}, errors: ${result.errors || 0}`);
      totalInserted += result.inserted || 0;
      totalUpdated += result.updated || 0;
      totalErrors += result.errors || 0;
    } catch (err: any) {
      console.error(` FAILED: ${err.message}`);
      totalErrors += batch.length;
    }

    await sleep(100);
  }

  console.log('\n=== Recovery Complete ===');
  console.log(`Inserted: ${totalInserted}`);
  console.log(`Updated: ${totalUpdated}`);
  console.log(`Errors: ${totalErrors}`);

  if (totalInserted > 0) {
    console.log(`\nVerifying "Grand Rapids" specifically...`);
    const { data } = await supabase
      .from('boundaries')
      .select('id, name, type, external_id, state_fips')
      .ilike('name', '%grand rapids%')
      .eq('type', 'place')
      .order('name');

    if (data) {
      for (const b of data) {
        console.log(`  ${b.name} | ext: ${b.external_id} | fips: ${b.state_fips}`);
      }
    }
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
