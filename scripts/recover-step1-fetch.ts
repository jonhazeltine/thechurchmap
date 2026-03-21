#!/usr/bin/env npx tsx
import { writeFileSync } from 'fs';

const MICHIGAN_FIPS = '26';
const TIGERWEB_BASE = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer';
const PLACES_LAYER = 28;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('Fetching all Michigan places from TIGERweb...');
  const places: any[] = [];
  let offset = 0;
  const batchSize = 100;
  let hasMore = true;

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
        places.push({
          external_id: f.properties.GEOID,
          name: f.properties.NAME,
          type: 'place',
          geometry: f.geometry,
          source: 'tigerweb_recovery',
          state_fips: MICHIGAN_FIPS,
        });
      }
    }
    process.stdout.write(`  ${places.length} places fetched...\r`);
    if (data.features.length < batchSize) { hasMore = false; } else { offset += batchSize; await sleep(200); }
  }
  console.log(`\nTotal: ${places.length} places`);
  writeFileSync('/tmp/mi-places.json', JSON.stringify(places));
  console.log('Saved to /tmp/mi-places.json');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
