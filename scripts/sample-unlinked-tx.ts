#!/usr/bin/env npx tsx
/**
 * Sample unlinked TX churches to verify their coordinates are outside Texas
 */

import { createClient } from '@supabase/supabase-js';
import * as wkx from 'wkx';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function parseLocation(location: any): { lat: number; lon: number } | null {
  if (!location) return null;
  if (typeof location === 'string' && /^[0-9a-fA-F]+$/.test(location)) {
    try {
      const buffer = Buffer.from(location, 'hex');
      const geometry = wkx.Geometry.parse(buffer);
      if (geometry && 'x' in geometry && 'y' in geometry) {
        return { lon: (geometry as any).x, lat: (geometry as any).y };
      }
    } catch (e) {}
  }
  return null;
}

// Texas bounding box (approximate)
const TX_BOUNDS = {
  minLat: 25.8,  // southernmost point
  maxLat: 36.5,  // northernmost point
  minLon: -106.6, // westernmost point
  maxLon: -93.5  // easternmost point
};

function isInTexas(lat: number, lon: number): boolean {
  return lat >= TX_BOUNDS.minLat && lat <= TX_BOUNDS.maxLat &&
         lon >= TX_BOUNDS.minLon && lon <= TX_BOUNDS.maxLon;
}

async function main() {
  console.log('=== Sample Unlinked TX Churches ===\n');
  
  // Fetch 100 unlinked TX churches
  const { data: churches } = await supabase
    .from('churches')
    .select('id, name, state, location')
    .eq('state', 'TX')
    .eq('boundary_ids', '{}')
    .limit(100);
  
  if (!churches) return;
  
  let inTexas = 0;
  let outsideTexas = 0;
  const samples: Array<{ name: string; lat: number; lon: number; inTX: boolean }> = [];
  
  for (const c of churches) {
    const parsed = parseLocation(c.location);
    if (parsed) {
      const inTX = isInTexas(parsed.lat, parsed.lon);
      if (inTX) inTexas++;
      else outsideTexas++;
      
      if (samples.length < 20) {
        samples.push({ 
          name: c.name || 'Unknown', 
          lat: parsed.lat, 
          lon: parsed.lon,
          inTX
        });
      }
    }
  }
  
  console.log(`Sample of 100 unlinked TX churches:`);
  console.log(`  Inside TX bounding box: ${inTexas}`);
  console.log(`  Outside TX bounding box: ${outsideTexas}\n`);
  
  console.log('Sample churches (first 20):');
  for (const s of samples) {
    const status = s.inTX ? '✅ IN TX' : '❌ OUTSIDE';
    console.log(`  ${status}: ${s.name} at ${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}`);
  }
  
  // Estimate total
  const outsidePct = outsideTexas / (inTexas + outsideTexas) * 100;
  console.log(`\nEstimated ${outsidePct.toFixed(0)}% of unlinked "TX" churches are actually outside Texas`);
}

main().catch(console.error);
