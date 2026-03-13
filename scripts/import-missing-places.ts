import fs from 'fs';
import path from 'path';

const GEOJSON_FILE = path.join(process.cwd(), 'attached_assets', 'tl_2025_26_place_1763823672270.json');
const API_URL = 'http://localhost:5000';

async function importMissingPlaces() {
  console.log('===== Import Missing PLACES (MultiPolygon features) =====\n');
  
  // Read GeoJSON file
  console.log(`Reading GeoJSON file: ${GEOJSON_FILE}`);
  const geojsonData = JSON.parse(fs.readFileSync(GEOJSON_FILE, 'utf8'));
  
  console.log(`Found ${geojsonData.features.length} total features\n`);
  
  // Filter to only MultiPolygon features (the ones that failed before)
  const multiPolygonFeatures = geojsonData.features.filter((f: any) => 
    f.geometry?.type === 'MultiPolygon'
  );
  
  console.log(`MultiPolygon features to import: ${multiPolygonFeatures.length}\n`);
  
  if (multiPolygonFeatures.length === 0) {
    console.log('No MultiPolygon features found. Nothing to import.');
    return;
  }
  
  // Prepare boundaries for import
  const boundaries = multiPolygonFeatures.map((feature: any) => ({
    external_id: feature.properties.GEOID,
    name: feature.properties.NAME,
    type: 'place',
    source: 'census_2025',
    geometry: feature.geometry
  }));
  
  console.log('Sample MultiPolygon place:');
  console.log(`  Name: ${boundaries[0].name}`);
  console.log(`  GEOID: ${boundaries[0].external_id}`);
  console.log(`  Geometry type: ${boundaries[0].geometry.type}`);
  console.log('');
  
  // Import boundaries
  console.log(`Importing ${boundaries.length} MultiPolygon places...`);
  
  const response = await fetch(`${API_URL}/api/boundaries/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ boundaries }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Import failed: ${response.status} - ${errorText}`);
  }
  
  const result = await response.json();
  
  console.log('\n=== Import Complete ===');
  console.log(`Successfully inserted: ${result.inserted} boundaries`);
  console.log(`Errors: ${result.errors}`);
  console.log(`Success rate: ${((result.inserted / boundaries.length) * 100).toFixed(1)}%`);
  
  if (result.inserted === multiPolygonFeatures.length) {
    console.log('\n✓ All previously failed MultiPolygon places imported successfully!');
  } else {
    console.log(`\n⚠ Some imports still failed. Check database constraints.`);
  }
}

// Run the import
importMissingPlaces()
  .then(() => {
    console.log('\n✓ Missing PLACES import completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Import failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
