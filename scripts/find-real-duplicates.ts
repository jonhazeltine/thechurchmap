import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Distance threshold in km for considering duplicates
const DISTANCE_THRESHOLD_KM = 0.5; // 500 meters

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function nameSimilarity(a: string, b: string): number {
  const cleanA = a.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const cleanB = b.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  
  // Check exact match
  if (cleanA === cleanB) return 1.0;
  
  // Check if one contains the other
  if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return 0.9;
  
  // Check word overlap
  const wordsA = new Set(cleanA.split(/\s+/));
  const wordsB = new Set(cleanB.split(/\s+/));
  const intersection = [...wordsA].filter(w => wordsB.has(w));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.length / union.size;
}

async function findRealDuplicates() {
  // Load the 83 imported churches
  const missingPath = path.join(__dirname, 'missing-churches.json');
  const imported83 = JSON.parse(fs.readFileSync(missingPath, 'utf-8'));
  
  // Get all churches with coordinates
  const { data: allChurches } = await supabase.rpc('fn_get_churches_simple');
  
  if (!allChurches) {
    console.error('Could not fetch churches');
    return;
  }
  
  console.log(`Checking ${imported83.length} imported churches against ${allChurches.length} total...\n`);
  console.log('Looking for: Similar name (>70%) AND within 500 meters\n');
  console.log('='.repeat(90));
  
  const realDuplicates: any[] = [];
  
  for (const imp of imported83) {
    // Find churches that are both:
    // 1. Within 500 meters
    // 2. Have similar names (>70% similarity)
    
    const nearby = allChurches.filter((c: any) => {
      if (!c.latitude || !c.longitude) return false;
      const dist = haversineDistance(imp.latitude, imp.longitude, c.latitude, c.longitude);
      return dist < DISTANCE_THRESHOLD_KM;
    });
    
    const matches = nearby.filter((c: any) => {
      const sim = nameSimilarity(imp.name, c.name);
      return sim > 0.7 && c.name !== imp.name; // Exclude exact self-match
    });
    
    if (matches.length > 0) {
      realDuplicates.push({
        imported: { name: imp.name, lat: imp.latitude, lon: imp.longitude },
        matches: matches.map((m: any) => ({
          name: m.name,
          source: m.source || 'manual',
          id: m.id,
          distance: haversineDistance(imp.latitude, imp.longitude, m.latitude, m.longitude) * 1000, // meters
          similarity: nameSimilarity(imp.name, m.name)
        }))
      });
    }
  }
  
  if (realDuplicates.length === 0) {
    console.log('\n✅ NO REAL DUPLICATES FOUND!');
    console.log('\nAll 83 imported churches are unique (no nearby churches with similar names).');
  } else {
    console.log(`\n⚠️  Found ${realDuplicates.length} potential real duplicates:\n`);
    
    realDuplicates.forEach((d, i) => {
      console.log(`${i + 1}. IMPORTED: "${d.imported.name}"`);
      console.log(`   Location: ${d.imported.lat.toFixed(4)}, ${d.imported.lon.toFixed(4)}`);
      d.matches.forEach((m: any) => {
        console.log(`   MATCH: "${m.name}" (${m.source})`);
        console.log(`          ID: ${m.id}, Distance: ${m.distance.toFixed(0)}m, Similarity: ${(m.similarity * 100).toFixed(0)}%`);
      });
      console.log('');
    });
  }
  
  // Also show Ignite and Mosaic status specifically
  console.log('='.repeat(90));
  console.log('\n📍 Status of Ignite and Mosaic specifically:\n');
  
  const ignite = imported83.find((c: any) => c.name.toLowerCase().includes('ignite'));
  const mosaic = imported83.find((c: any) => c.name.toLowerCase().includes('mosaic'));
  
  if (ignite) {
    const igniteInDb = allChurches.filter((c: any) => c.name.toLowerCase().includes('ignite'));
    console.log(`IGNITE: "${ignite.name}"`);
    console.log(`  Location: ${ignite.latitude}, ${ignite.longitude}`);
    console.log(`  Found ${igniteInDb.length} "ignite" entries in database:`);
    igniteInDb.forEach((c: any) => console.log(`    - ${c.name} (${c.source || 'manual'}) ID: ${c.id}`));
  }
  
  if (mosaic) {
    const mosaicInDb = allChurches.filter((c: any) => c.name.toLowerCase().includes('mosaic'));
    console.log(`\nMOSAIC: "${mosaic.name}"`);
    console.log(`  Location: ${mosaic.latitude}, ${mosaic.longitude}`);
    console.log(`  Found ${mosaicInDb.length} "mosaic" entries in database:`);
    mosaicInDb.forEach((c: any) => console.log(`    - ${c.name} (${c.source || 'manual'}) ID: ${c.id}`));
  }
}

findRealDuplicates().catch(console.error);
