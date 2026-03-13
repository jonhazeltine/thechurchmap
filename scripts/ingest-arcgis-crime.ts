#!/usr/bin/env npx tsx
/**
 * Ingest crime data from ArcGIS Hub feature services
 * 
 * Usage:
 *   npx tsx scripts/ingest-arcgis-crime.ts --city "Grand Rapids"
 *   npx tsx scripts/ingest-arcgis-crime.ts --list
 *   npx tsx scripts/ingest-arcgis-crime.ts --city "Grand Rapids" --dry-run
 * 
 * Note: Coverage is spotty - only cities that publish open data are available.
 * Add new endpoints to CITY_ENDPOINTS as discovered.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Registry of known ArcGIS crime endpoints
// Add new cities as they're discovered
interface CityEndpoint {
  name: string;
  state: string;
  url: string;
  crimeLayer: number;
  fieldMappings: {
    date: string;
    type: string;
    address?: string;
    latitude?: string;
    longitude?: string;
  };
}

const CITY_ENDPOINTS: CityEndpoint[] = [
  {
    name: 'Grand Rapids',
    state: 'MI',
    url: 'https://gis.algonquin.org/arcgis/rest/services/PublicSafetyMap/MapServer',
    crimeLayer: 0,
    fieldMappings: {
      date: 'IncidentDate',
      type: 'OffenseCategory',
      address: 'Address',
      latitude: 'Latitude',
      longitude: 'Longitude'
    }
  },
  // Add more cities as discovered:
  // {
  //   name: 'Detroit',
  //   state: 'MI',
  //   url: 'https://...',
  //   crimeLayer: 0,
  //   fieldMappings: { ... }
  // }
];

interface CrimeIncident {
  city: string;
  state: string;
  incident_date: Date | null;
  offense_type: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string;
  raw_data: Record<string, any>;
}

async function fetchArcGISLayer(
  endpoint: CityEndpoint,
  offset: number = 0,
  limit: number = 1000
): Promise<{ features: any[]; exceededLimit: boolean }> {
  const url = `${endpoint.url}/${endpoint.crimeLayer}/query`;
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    returnGeometry: 'true',
    f: 'json',
    resultOffset: offset.toString(),
    resultRecordCount: limit.toString()
  });
  
  const response = await fetch(`${url}?${params}`);
  if (!response.ok) {
    throw new Error(`ArcGIS error: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.error) {
    throw new Error(`ArcGIS API error: ${data.error.message}`);
  }
  
  return {
    features: data.features || [],
    exceededLimit: data.exceededTransferLimit === true
  };
}

function parseFeature(feature: any, endpoint: CityEndpoint): CrimeIncident | null {
  const attrs = feature.attributes || {};
  const geom = feature.geometry;
  const mappings = endpoint.fieldMappings;
  
  // Get offense type - required
  const offenseType = attrs[mappings.type];
  if (!offenseType) return null;
  
  // Parse date
  let incidentDate: Date | null = null;
  const dateValue = attrs[mappings.date];
  if (dateValue) {
    // ArcGIS often uses epoch milliseconds
    if (typeof dateValue === 'number') {
      incidentDate = new Date(dateValue);
    } else if (typeof dateValue === 'string') {
      incidentDate = new Date(dateValue);
    }
  }
  
  // Get coordinates
  let lat: number | null = null;
  let lon: number | null = null;
  
  if (mappings.latitude && mappings.longitude) {
    lat = attrs[mappings.latitude] || null;
    lon = attrs[mappings.longitude] || null;
  } else if (geom) {
    // Use geometry if available
    lat = geom.y || null;
    lon = geom.x || null;
  }
  
  return {
    city: endpoint.name,
    state: endpoint.state,
    incident_date: incidentDate,
    offense_type: offenseType,
    address: mappings.address ? attrs[mappings.address] || null : null,
    latitude: lat,
    longitude: lon,
    source: `arcgis_${endpoint.name.toLowerCase().replace(/\s+/g, '_')}`,
    raw_data: attrs
  };
}

async function upsertIncidents(incidents: CrimeIncident[], dryRun: boolean): Promise<number> {
  if (dryRun) {
    console.log(`  [DRY RUN] Would insert ${incidents.length} incidents`);
    return incidents.length;
  }
  
  let inserted = 0;
  const BATCH_SIZE = 500;
  
  for (let i = 0; i < incidents.length; i += BATCH_SIZE) {
    const batch = incidents.slice(i, i + BATCH_SIZE);
    
    const records = batch.map(inc => ({
      city: inc.city,
      state: inc.state,
      incident_date: inc.incident_date?.toISOString() || null,
      offense_type: inc.offense_type,
      address: inc.address,
      location: inc.latitude && inc.longitude 
        ? `SRID=4326;POINT(${inc.longitude} ${inc.latitude})`
        : null,
      source: inc.source,
      raw_data: inc.raw_data
    }));
    
    const { error } = await supabase
      .from('crime_incidents')
      .insert(records);
    
    if (error) {
      console.error(`  Error inserting batch: ${error.message}`);
    } else {
      inserted += batch.length;
    }
    
    if ((i + BATCH_SIZE) % 2000 === 0 || i + BATCH_SIZE >= incidents.length) {
      console.log(`  Inserted ${Math.min(i + BATCH_SIZE, incidents.length)}/${incidents.length}`);
    }
  }
  
  return inserted;
}

async function ingestCity(endpoint: CityEndpoint, dryRun: boolean): Promise<number> {
  console.log(`\nFetching from ${endpoint.name}, ${endpoint.state}...`);
  console.log(`  URL: ${endpoint.url}/${endpoint.crimeLayer}`);
  
  const allIncidents: CrimeIncident[] = [];
  let offset = 0;
  const PAGE_SIZE = 1000;
  let hasMore = true;
  
  while (hasMore) {
    const { features, exceededLimit } = await fetchArcGISLayer(endpoint, offset, PAGE_SIZE);
    
    for (const feature of features) {
      const incident = parseFeature(feature, endpoint);
      if (incident) {
        allIncidents.push(incident);
      }
    }
    
    console.log(`  Fetched ${offset + features.length} records...`);
    
    if (features.length < PAGE_SIZE || !exceededLimit) {
      hasMore = false;
    } else {
      offset += features.length;
      // Rate limit
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  console.log(`  Total incidents parsed: ${allIncidents.length}`);
  
  // Upsert to Supabase
  const inserted = await upsertIncidents(allIncidents, dryRun);
  
  return inserted;
}

function listEndpoints() {
  console.log('=== Available ArcGIS Crime Endpoints ===\n');
  
  if (CITY_ENDPOINTS.length === 0) {
    console.log('No endpoints configured yet.');
    console.log('Add new cities to CITY_ENDPOINTS in this script as they are discovered.');
    return;
  }
  
  for (const ep of CITY_ENDPOINTS) {
    console.log(`${ep.name}, ${ep.state}`);
    console.log(`  URL: ${ep.url}`);
    console.log(`  Layer: ${ep.crimeLayer}`);
    console.log('');
  }
  
  console.log(`Total: ${CITY_ENDPOINTS.length} cities`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--list')) {
    listEndpoints();
    return;
  }
  
  const cityIndex = args.indexOf('--city');
  const dryRun = args.includes('--dry-run');
  
  if (cityIndex === -1 || !args[cityIndex + 1]) {
    console.log('Usage:');
    console.log('  npx tsx scripts/ingest-arcgis-crime.ts --list');
    console.log('  npx tsx scripts/ingest-arcgis-crime.ts --city "Grand Rapids" [--dry-run]');
    process.exit(1);
  }
  
  const cityName = args[cityIndex + 1];
  const endpoint = CITY_ENDPOINTS.find(
    ep => ep.name.toLowerCase() === cityName.toLowerCase()
  );
  
  if (!endpoint) {
    console.error(`City not found: ${cityName}`);
    console.log('\nAvailable cities:');
    CITY_ENDPOINTS.forEach(ep => console.log(`  - ${ep.name}, ${ep.state}`));
    console.log('\nTo add a new city, edit CITY_ENDPOINTS in this script.');
    process.exit(1);
  }
  
  console.log(`=== Ingest ArcGIS Crime Data ===`);
  console.log(`City: ${endpoint.name}, ${endpoint.state}`);
  if (dryRun) console.log(`Mode: DRY RUN`);
  
  try {
    const inserted = await ingestCity(endpoint, dryRun);
    
    console.log(`\n✅ Complete!`);
    console.log(`   City: ${endpoint.name}, ${endpoint.state}`);
    console.log(`   Incidents imported: ${inserted}`);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
