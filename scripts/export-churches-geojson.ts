import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import wkx from 'wkx';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface ChurchRow {
  id: string;
  location: string | null; // WKB hex string
}

interface GeoJSONFeature {
  type: 'Feature';
  properties: {
    id: string;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

function parseWkbHex(wkbHex: string): [number, number] | null {
  try {
    const geometry = wkx.Geometry.parse(Buffer.from(wkbHex, 'hex'));
    const geojson = geometry.toGeoJSON() as { type: string; coordinates: [number, number] };
    if (geojson.type === 'Point' && geojson.coordinates) {
      return geojson.coordinates;
    }
    return null;
  } catch {
    return null;
  }
}

async function exportChurchesToGeoJSON() {
  console.log('Starting church export to GeoJSON...');
  console.log('Using wkx library to parse PostGIS WKB hex strings...');
  
  const features: GeoJSONFeature[] = [];
  const batchSize = 10000;
  let offset = 0;
  let totalProcessed = 0;
  let hasMore = true;

  while (hasMore) {
    console.log(`Fetching batch at offset ${offset}...`);
    
    const { data, error } = await supabase
      .from('churches')
      .select('id, location')
      .not('location', 'is', null)
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error('Error fetching churches:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      hasMore = false;
      continue;
    }

    for (const church of data as ChurchRow[]) {
      if (church.location) {
        const coords = parseWkbHex(church.location);
        if (coords) {
          const [lng, lat] = coords;
          if (typeof lng === 'number' && typeof lat === 'number' && 
              !isNaN(lng) && !isNaN(lat) &&
              lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90) {
            features.push({
              type: 'Feature',
              properties: {
                id: church.id
              },
              geometry: {
                type: 'Point',
                coordinates: [lng, lat]
              }
            });
          }
        }
      }
    }

    totalProcessed += data.length;
    console.log(`Processed ${totalProcessed} churches, ${features.length} valid features so far`);
    
    if (data.length < batchSize) {
      hasMore = false;
    } else {
      offset += batchSize;
    }
  }

  const geojson: GeoJSONFeatureCollection = {
    type: 'FeatureCollection',
    features
  };

  const outputPath = 'scripts/all-churches.geojson';
  fs.writeFileSync(outputPath, JSON.stringify(geojson));
  
  console.log(`\nExport complete!`);
  console.log(`Total churches processed: ${totalProcessed}`);
  console.log(`Valid features exported: ${features.length}`);
  console.log(`Output file: ${outputPath}`);
  console.log(`File size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`);
}

exportChurchesToGeoJSON().catch(console.error);
