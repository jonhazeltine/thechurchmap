import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import wkx from 'wkx';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

interface ChurchRow {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  location: string;
}

function parseWKB(wkbHex: string): [number, number] | null {
  try {
    const buffer = Buffer.from(wkbHex, 'hex');
    const geometry = wkx.Geometry.parse(buffer);
    const geojson = geometry.toGeoJSON() as { type: string; coordinates: [number, number] };
    if (geojson.type === 'Point' && geojson.coordinates) {
      return geojson.coordinates;
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function exportChurches() {
  console.log('Fetching all churches from Supabase...');
  
  const allChurches: ChurchRow[] = [];
  const pageSize = 10000;
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const { data, error } = await supabase
      .from('churches')
      .select('id, name, city, state, location')
      .not('location', 'is', null)
      .range(offset, offset + pageSize - 1);
    
    if (error) {
      console.error('Error fetching churches:', error);
      throw error;
    }
    
    if (data && data.length > 0) {
      allChurches.push(...data);
      console.log(`Fetched ${allChurches.length} churches...`);
      offset += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }
  
  console.log(`\nTotal churches fetched: ${allChurches.length}`);
  console.log('Parsing WKB coordinates...');
  
  // US bounding box (continental US + Alaska + Hawaii)
  const isInUS = (lng: number, lat: number): boolean => {
    // Continental US (including buffer for border towns)
    if (lat >= 24.5 && lat <= 49.5 && lng >= -125 && lng <= -66.5) {
      // Extra check: exclude Mexico (south of US-Mexico border)
      // Border roughly follows lat 31.3 in west TX/NM, lat 32 in AZ, slopes to lat 25.8 at Gulf
      if (lng < -103 && lat < 31.3) return false;  // West of TX panhandle, south of border
      if (lng >= -103 && lng < -97 && lat < 25.8) return false;  // South Texas
      return true;
    }
    // Alaska
    if (lat >= 51 && lat <= 72 && lng >= -180 && lng <= -130) return true;
    // Hawaii
    if (lat >= 18.5 && lat <= 23 && lng >= -161 && lng <= -154) return true;
    return false;
  };

  // Convert to GeoJSON
  const features = allChurches
    .map(church => {
      const coords = parseWKB(church.location);
      if (!coords) return null;
      
      const [lng, lat] = coords;
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
      
      // Filter to US only
      if (!isInUS(lng, lat)) return null;
      
      return {
        type: 'Feature' as const,
        properties: {
          id: church.id,
          name: church.name || 'Unknown Church',
          city: church.city || '',
          state: church.state || ''
        },
        geometry: {
          type: 'Point' as const,
          coordinates: coords
        }
      };
    })
    .filter(Boolean);
  
  const geojson = {
    type: 'FeatureCollection' as const,
    features
  };
  
  const outputPath = './all-churches-v7.geojson';
  fs.writeFileSync(outputPath, JSON.stringify(geojson));
  
  console.log(`\nExported ${features.length} churches to ${outputPath}`);
  console.log(`File size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`);
  
  // Also create sampled version for low-zoom layer
  const sampledFeatures = features.filter((_, i) => i % 16 === 0);
  const sampledGeojson = {
    type: 'FeatureCollection' as const,
    features: sampledFeatures
  };
  
  const sampledPath = './client/public/all-churches-sampled.geojson';
  fs.writeFileSync(sampledPath, JSON.stringify(sampledGeojson));
  console.log(`Exported ${sampledFeatures.length} sampled churches to ${sampledPath}`);
  
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  NEXT STEPS - Generate MBTiles
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Run tippecanoe to create vector tiles:

tippecanoe -o all-churches-v7.mbtiles \\
  -l churches \\
  -z 14 \\
  -B 0 \\
  --drop-densest-as-needed \\
  --extend-zooms-if-still-dropping \\
  ${outputPath}

Then upload to Mapbox Studio:
https://studio.mapbox.com/tilesets/

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

exportChurches().catch(console.error);
