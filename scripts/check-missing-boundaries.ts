import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log('=== Checking for Missing County Subdivision Boundaries ===\n');

  // Read the GeoJSON file
  const geojsonPath = 'attached_assets/tl_2025_26_cousub_1764043161000.json';
  const geojsonData = JSON.parse(readFileSync(geojsonPath, 'utf-8'));
  
  console.log(`File contains ${geojsonData.features.length} county subdivisions\n`);

  // Get all boundaries from database
  let allDbBoundaries: any[] = [];
  let offset = 0;
  const batchSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('boundaries')
      .select('id, name, type, external_id')
      .range(offset, offset + batchSize - 1);
    
    if (error) {
      console.error('Error fetching boundaries:', error);
      break;
    }
    
    if (data && data.length > 0) {
      allDbBoundaries = allDbBoundaries.concat(data);
      offset += batchSize;
      if (data.length < batchSize) break;
    } else {
      break;
    }
  }
  
  console.log(`Database contains ${allDbBoundaries.length} boundaries\n`);

  // Create lookup sets
  const dbNameSet = new Set(allDbBoundaries.map(b => b.name.toLowerCase().trim()));
  const dbExternalIdSet = new Set(allDbBoundaries.filter(b => b.external_id).map(b => b.external_id));

  // Find missing boundaries
  const missingBoundaries: any[] = [];
  const existingBoundaries: any[] = [];

  for (const feature of geojsonData.features) {
    const name = feature.properties.NAMELSAD; // Full name like "Grand Rapids charter township"
    const geoid = feature.properties.GEOID;
    const shortName = feature.properties.NAME; // Short name like "Grand Rapids"
    
    // Check if exists by external_id (GEOID) or by FULL name only
    // Don't match on short name - that causes false positives 
    // (e.g., "Grand Rapids" city != "Grand Rapids charter township")
    const existsByGeoid = dbExternalIdSet.has(geoid);
    const existsByFullName = dbNameSet.has(name.toLowerCase().trim());
    
    if (existsByGeoid || existsByFullName) {
      existingBoundaries.push({ name, geoid, matchType: existsByGeoid ? 'geoid' : 'fullName' });
    } else {
      missingBoundaries.push({
        external_id: geoid,
        name: name,
        shortName: shortName,
        type: 'place', // Use 'place' type so it works with existing boundary detection
        geometry: feature.geometry,
        source: 'census_cousub_2025'
      });
    }
  }

  console.log(`Existing in DB: ${existingBoundaries.length}`);
  console.log(`Missing from DB: ${missingBoundaries.length}\n`);

  // Show some missing ones
  console.log('=== Sample of Missing Boundaries ===');
  const sampleMissing = missingBoundaries.slice(0, 20);
  sampleMissing.forEach(b => console.log(`  - ${b.name} (GEOID: ${b.external_id})`));
  
  if (missingBoundaries.length > 20) {
    console.log(`  ... and ${missingBoundaries.length - 20} more`);
  }

  // Check specifically for Grand Rapids charter township
  const grCharterTwp = missingBoundaries.find(b => b.name.toLowerCase().includes('grand rapids charter'));
  if (grCharterTwp) {
    console.log('\n*** CONFIRMED: Grand Rapids charter township is MISSING from database ***');
  } else {
    const grInExisting = existingBoundaries.find(b => b.name.toLowerCase().includes('grand rapids charter'));
    if (grInExisting) {
      console.log('\nGrand Rapids charter township already exists in database');
    }
  }

  // Save missing boundaries to a file for import
  if (missingBoundaries.length > 0) {
    const outputPath = 'scripts/missing-boundaries.json';
    const outputData = {
      count: missingBoundaries.length,
      boundaries: missingBoundaries.map(b => ({
        external_id: b.external_id,
        name: b.name,
        type: b.type,
        geometry: JSON.stringify(b.geometry),
        source: b.source
      }))
    };
    
    const fs = await import('fs');
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    console.log(`\nMissing boundaries saved to: ${outputPath}`);
  }

  // Also check how Grand Rapids charter township is stored in the database
  const { data: grCheck } = await supabase
    .from('boundaries')
    .select('id, name, type, external_id')
    .ilike('name', '%grand rapids%');
  
  console.log('\n=== Grand Rapids boundaries in database ===');
  grCheck?.forEach(b => console.log(`  - "${b.name}" (type: ${b.type}, id: ${b.id})`));

  return { missing: missingBoundaries.length, existing: existingBoundaries.length };
}

main().catch(console.error);
