import { createClient } from '@supabase/supabase-js';
import * as turf from '@turf/turf';
import wkx from 'wkx';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface Church {
  id: string;
  name: string;
  location: any;
  boundary_ids: string[];
}

interface Boundary {
  id: string;
  name: string;
  type: string;
  geometry: any;
}

async function fetchAllBoundaries(): Promise<Boundary[]> {
  console.log('Fetching all boundaries...');
  let allBoundaries: Boundary[] = [];
  let offset = 0;
  const batchSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('boundaries')
      .select('id, name, type, geometry')
      .range(offset, offset + batchSize - 1);
    
    if (error) {
      console.error('Error fetching boundaries:', error);
      break;
    }
    
    if (data && data.length > 0) {
      allBoundaries = allBoundaries.concat(data);
      offset += batchSize;
      if (data.length < batchSize) break;
    } else {
      break;
    }
  }
  
  console.log(`  Fetched ${allBoundaries.length} boundaries`);
  return allBoundaries;
}

async function fetchAllChurches(): Promise<Church[]> {
  console.log('Fetching all churches with locations...');
  let allChurches: Church[] = [];
  let offset = 0;
  const batchSize = 1000;
  
  while (true) {
    const { data, error } = await supabase
      .from('churches')
      .select('id, name, location, boundary_ids')
      .not('location', 'is', null)
      .range(offset, offset + batchSize - 1);
    
    if (error) {
      console.error('Error fetching churches:', error);
      break;
    }
    
    if (data && data.length > 0) {
      allChurches = allChurches.concat(data);
      offset += batchSize;
      if (data.length < batchSize) break;
    } else {
      break;
    }
  }
  
  console.log(`  Fetched ${allChurches.length} churches with locations`);
  return allChurches;
}

function parseGeometry(geometry: any): any {
  if (!geometry) return null;
  
  try {
    if (typeof geometry === 'string') {
      // Check if it's a hex-encoded WKB string
      if (/^[0-9a-fA-F]+$/.test(geometry)) {
        const buffer = Buffer.from(geometry, 'hex');
        const geom = wkx.Geometry.parse(buffer);
        return geom.toGeoJSON();
      } else {
        // Try parsing as JSON
        return JSON.parse(geometry);
      }
    } else if (typeof geometry === 'object') {
      return geometry;
    }
  } catch (e) {
    return null;
  }
  return null;
}

function getChurchCoordinates(location: any): [number, number] | null {
  if (!location) return null;
  
  try {
    // location can be GeoJSON Point or WKB
    let geojson = parseGeometry(location);
    if (geojson && geojson.type === 'Point' && geojson.coordinates) {
      return [geojson.coordinates[0], geojson.coordinates[1]];
    }
  } catch (e) {
    return null;
  }
  return null;
}

function findContainingBoundaries(coords: [number, number], boundaries: Boundary[]): string[] {
  const point = turf.point(coords);
  const matchingBoundaryIds: string[] = [];
  
  for (const boundary of boundaries) {
    try {
      const geojson = parseGeometry(boundary.geometry);
      if (!geojson || !geojson.type) continue;
      
      let isContained = false;
      
      if (geojson.type === 'Polygon') {
        const polygon = turf.polygon(geojson.coordinates);
        isContained = turf.booleanPointInPolygon(point, polygon);
      } else if (geojson.type === 'MultiPolygon') {
        for (const coords of geojson.coordinates) {
          const subPolygon = turf.polygon(coords);
          if (turf.booleanPointInPolygon(point, subPolygon)) {
            isContained = true;
            break;
          }
        }
      }
      
      if (isContained) {
        matchingBoundaryIds.push(boundary.id);
      }
    } catch (e) {
      // Skip invalid geometries
    }
  }
  
  return matchingBoundaryIds;
}

async function main() {
  console.log('=== Linking Churches to All Matching Boundaries ===\n');
  
  const boundaries = await fetchAllBoundaries();
  const churches = await fetchAllChurches();
  
  console.log('\nProcessing churches...\n');
  
  let processed = 0;
  let updated = 0;
  let noLocation = 0;
  let noMatch = 0;
  let errors = 0;
  
  const updateBatch: { id: string; boundary_ids: string[] }[] = [];
  
  for (const church of churches) {
    processed++;
    
    const coords = getChurchCoordinates(church.location);
    if (!coords) {
      noLocation++;
      continue;
    }
    
    const matchingBoundaryIds = findContainingBoundaries(coords, boundaries);
    
    if (matchingBoundaryIds.length === 0) {
      noMatch++;
      continue;
    }
    
    // Check if we need to update
    const currentIds = church.boundary_ids || [];
    const newIds = [...new Set([...currentIds, ...matchingBoundaryIds])];
    
    if (newIds.length > currentIds.length) {
      updateBatch.push({ id: church.id, boundary_ids: newIds });
      updated++;
    }
    
    if (processed % 100 === 0) {
      console.log(`  Processed ${processed}/${churches.length} churches...`);
    }
  }
  
  console.log(`\nUpdating ${updateBatch.length} churches with new boundary links...`);
  
  // Update churches in batches
  const batchSize = 50;
  for (let i = 0; i < updateBatch.length; i += batchSize) {
    const batch = updateBatch.slice(i, i + batchSize);
    
    for (const update of batch) {
      const { error } = await supabase
        .from('churches')
        .update({ boundary_ids: update.boundary_ids })
        .eq('id', update.id);
      
      if (error) {
        console.error(`  Error updating church ${update.id}:`, error.message);
        errors++;
      }
    }
    
    console.log(`  Updated batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(updateBatch.length / batchSize)}`);
  }
  
  console.log('\n=== Summary ===');
  console.log(`Total churches processed: ${processed}`);
  console.log(`Churches updated with new boundaries: ${updated}`);
  console.log(`Churches with no location: ${noLocation}`);
  console.log(`Churches with no matching boundary: ${noMatch}`);
  console.log(`Errors: ${errors}`);
  
  // Show sample of updated churches
  if (updateBatch.length > 0) {
    console.log('\n=== Sample Updated Churches ===');
    const sample = updateBatch.slice(0, 5);
    for (const update of sample) {
      const church = churches.find(c => c.id === update.id);
      console.log(`  ${church?.name}: ${update.boundary_ids.length} boundaries linked`);
    }
  }
}

main().catch(console.error);
