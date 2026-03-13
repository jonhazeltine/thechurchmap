import { readFileSync } from 'fs';

async function analyzePlacesFile() {
  console.log('===== PLACES Import Failure Analysis =====\n');
  
  const geojsonPath = 'attached_assets/tl_2025_26_place_1763823672270.json';
  const geojsonData = JSON.parse(readFileSync(geojsonPath, 'utf-8'));
  
  console.log(`Total features in file: ${geojsonData.features.length}`);
  console.log(`Expected imports: ${geojsonData.features.length}`);
  console.log(`Actual imports: 684`);
  console.log(`Failed imports: ${geojsonData.features.length - 684}\n`);
  
  // Analyze geometry types
  const geometryTypes: Record<string, number> = {};
  const invalidFeatures: any[] = [];
  const missingData: any[] = [];
  
  geojsonData.features.forEach((feature: any, index: number) => {
    const geomType = feature.geometry?.type || 'MISSING';
    geometryTypes[geomType] = (geometryTypes[geomType] || 0) + 1;
    
    // Check for missing required fields
    if (!feature.properties?.NAME) {
      missingData.push({
        index,
        reason: 'Missing NAME property',
        properties: feature.properties
      });
    }
    
    if (!feature.properties?.GEOID) {
      missingData.push({
        index,
        reason: 'Missing GEOID property',
        properties: feature.properties
      });
    }
    
    if (!feature.geometry) {
      invalidFeatures.push({
        index,
        reason: 'Missing geometry',
        properties: feature.properties
      });
    }
    
    // Check for complex MultiPolygon that might fail
    if (feature.geometry?.type === 'MultiPolygon') {
      const coordCount = JSON.stringify(feature.geometry.coordinates).length;
      if (coordCount > 100000) {
        invalidFeatures.push({
          index,
          name: feature.properties?.NAME,
          reason: `Very large MultiPolygon (${coordCount} chars)`,
          geoid: feature.properties?.GEOID
        });
      }
    }
  });
  
  console.log('=== Geometry Type Distribution ===');
  Object.entries(geometryTypes).forEach(([type, count]) => {
    console.log(`${type}: ${count}`);
  });
  console.log('');
  
  if (missingData.length > 0) {
    console.log(`=== Missing Required Data (${missingData.length}) ===`);
    missingData.slice(0, 10).forEach((item, i) => {
      console.log(`${i + 1}. Feature ${item.index}: ${item.reason}`);
    });
    console.log('');
  }
  
  if (invalidFeatures.length > 0) {
    console.log(`=== Potentially Problematic Features (${invalidFeatures.length}) ===`);
    invalidFeatures.slice(0, 20).forEach((item, i) => {
      console.log(`${i + 1}. Feature ${item.index}: ${item.name || 'Unknown'} - ${item.reason}`);
    });
    console.log('');
  }
  
  // Check the boundaries table schema expectation
  console.log('=== Likely Failure Causes ===');
  console.log('1. Geometry type mismatch:');
  console.log('   - Database expects: geography(Polygon, 4326)');
  console.log('   - But MultiPolygon features would fail');
  console.log('   - Solution: Update schema to accept MultiPolygon OR convert during import\n');
  
  console.log('2. Invalid GeoJSON:');
  console.log('   - ST_GeomFromGeoJSON might reject malformed coordinates');
  console.log('   - Self-intersecting polygons could fail\n');
  
  console.log('3. Size limits:');
  console.log('   - Very large geometries might exceed PostGIS limits\n');
  
  // Calculate expected failures
  const multiPolygonCount = geometryTypes['MultiPolygon'] || 0;
  console.log(`\n=== Hypothesis ===`);
  console.log(`MultiPolygon features in file: ${multiPolygonCount}`);
  console.log(`Failed imports: ${geojsonData.features.length - 684}`);
  
  if (multiPolygonCount === geojsonData.features.length - 684) {
    console.log(`✓ MATCH! All MultiPolygon features likely failed due to schema mismatch`);
  } else {
    console.log(`Partial match - other factors may be involved`);
  }
}

analyzePlacesFile()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Analysis failed:', error);
    process.exit(1);
  });
