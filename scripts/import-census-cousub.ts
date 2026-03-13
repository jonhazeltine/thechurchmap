import fs from 'fs';
import path from 'path';

const GEOJSON_FILE = path.join(process.cwd(), 'attached_assets', 'tl_2025_26_cousub_1763827377960.json');
const API_URL = 'http://localhost:5000';

async function importCOUSUBBoundaries() {
  console.log('===== Michigan County Subdivision (COUSUB) Boundary Import =====\n');
  
  // Read GeoJSON file
  console.log(`Reading GeoJSON file: ${GEOJSON_FILE}`);
  const geojsonData = JSON.parse(fs.readFileSync(GEOJSON_FILE, 'utf8'));
  
  console.log(`Found ${geojsonData.features.length} COUSUB features\n`);
  
  // Step 1: Fetch existing boundaries to check for duplicates
  console.log('Fetching existing boundaries from database...');
  const existingResponse = await fetch(`${API_URL}/api/boundaries`);
  if (!existingResponse.ok) {
    throw new Error(`Failed to fetch existing boundaries: ${existingResponse.status}`);
  }
  const existingBoundaries = await existingResponse.json();
  console.log(`Found ${existingBoundaries.length} existing boundaries\n`);
  
  // Create lookup maps for deduplication
  const existingByGeoid = new Map();
  const existingByName = new Map();
  
  existingBoundaries.forEach((boundary: any) => {
    if (boundary.external_id) {
      existingByGeoid.set(boundary.external_id, boundary);
    }
    if (boundary.name) {
      // Normalize name for case-insensitive comparison
      const normalizedName = boundary.name.toLowerCase().trim();
      existingByName.set(normalizedName, boundary);
    }
  });
  
  console.log(`Created lookup maps: ${existingByGeoid.size} by GEOID, ${existingByName.size} by name\n`);
  
  // Step 2: Process features and filter duplicates
  const boundariesToInsert: any[] = [];
  const skippedDuplicates: any[] = [];
  
  for (const feature of geojsonData.features) {
    const geoid = feature.properties.GEOID;
    const name = feature.properties.NAMELSAD;
    const normalizedName = name.toLowerCase().trim();
    
    // Check for duplicates
    let isDuplicate = false;
    let duplicateReason = '';
    
    if (existingByGeoid.has(geoid)) {
      isDuplicate = true;
      duplicateReason = `GEOID match: ${geoid}`;
    } else if (existingByName.has(normalizedName)) {
      isDuplicate = true;
      duplicateReason = `Name match: "${name}"`;
    }
    
    if (isDuplicate) {
      skippedDuplicates.push({
        name,
        geoid,
        reason: duplicateReason
      });
    } else {
      boundariesToInsert.push({
        external_id: geoid,
        name: name,
        type: 'county subdivision',
        source: 'census_2025',
        geometry: feature.geometry
      });
    }
  }
  
  console.log('=== Deduplication Summary ===');
  console.log(`Total features in COUSUB file: ${geojsonData.features.length}`);
  console.log(`Unique boundaries to insert: ${boundariesToInsert.length}`);
  console.log(`Duplicates skipped: ${skippedDuplicates.length}\n`);
  
  if (skippedDuplicates.length > 0) {
    console.log('First 10 skipped duplicates:');
    skippedDuplicates.slice(0, 10).forEach((dup, i) => {
      console.log(`  ${i + 1}. ${dup.name} (${dup.geoid}) - ${dup.reason}`);
    });
    console.log('');
  }
  
  // Step 3: Insert unique boundaries
  if (boundariesToInsert.length === 0) {
    console.log('No unique boundaries to insert. All were duplicates.');
    return;
  }
  
  console.log(`Inserting ${boundariesToInsert.length} unique boundaries...`);
  
  const response = await fetch(`${API_URL}/api/boundaries/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ boundaries: boundariesToInsert }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Import failed: ${response.status} - ${errorText}`);
  }
  
  const result = await response.json();
  
  console.log('\n=== Import Complete ===');
  console.log(`Successfully inserted: ${result.inserted || boundariesToInsert.length} boundaries`);
  console.log(`Total processed: ${geojsonData.features.length}`);
  console.log(`Duplicates skipped: ${skippedDuplicates.length}`);
  console.log(`Success rate: ${((boundariesToInsert.length / geojsonData.features.length) * 100).toFixed(1)}%`);
  
  // Save duplicate report to file
  if (skippedDuplicates.length > 0) {
    const reportPath = path.join(process.cwd(), 'cousub-duplicates-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(skippedDuplicates, null, 2));
    console.log(`\nDuplicate report saved to: ${reportPath}`);
  }
}

// Run the import
importCOUSUBBoundaries()
  .then(() => {
    console.log('\n✓ COUSUB boundary import completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Import failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
