/**
 * Batch Crime Data Ingestion for Missing Cities
 * 
 * Ingests recent crime data (2024+) for cities that need fresh data.
 * Uses proper batching and upserts to protect database integrity.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BATCH_SIZE = 500;

interface CrimeIncident {
  city: string;
  state: string;
  incident_date: string;
  offense_type: string;
  normalized_type: string | null;
  address: string | null;
  case_number: string | null;
  source: string;
  latitude?: number;
  longitude?: number;
  raw_data: any;
}

const OFFENSE_MAPPING: Record<string, string> = {
  'THEFT': 'theft_rate',
  'LARCENY': 'theft_rate',
  'BURGLARY': 'burglary_rate',
  'ROBBERY': 'robbery_rate',
  'ASSAULT': 'assault_rate',
  'BATTERY': 'assault_rate',
  'HOMICIDE': 'assault_rate',
  'MOTOR VEHICLE THEFT': 'vehicle_theft_rate',
  'VEHICLE THEFT': 'vehicle_theft_rate',
  'CRIMINAL DAMAGE': 'vandalism_rate',
  'VANDALISM': 'vandalism_rate',
  'NARCOTICS': 'drug_offense_rate',
  'DRUG': 'drug_offense_rate',
  'WEAPONS': 'weapons_offense_rate',
  'FRAUD': 'fraud_rate',
  'DECEPTIVE PRACTICE': 'fraud_rate',
  'SEX OFFENSE': 'sex_offense_rate',
  'CRIMINAL SEXUAL': 'sex_offense_rate',
};

function normalizeOffenseType(offense: string): string | null {
  if (!offense) return null;
  const upper = offense.toUpperCase();
  
  for (const [key, value] of Object.entries(OFFENSE_MAPPING)) {
    if (upper.includes(key)) return value;
  }
  return null;
}

async function insertBatch(incidents: CrimeIncident[]): Promise<number> {
  if (incidents.length === 0) return 0;
  
  const rows = incidents.map(inc => ({
    city: inc.city,
    state: inc.state,
    incident_date: inc.incident_date,
    offense_type: inc.offense_type,
    normalized_type: inc.normalized_type,
    address: inc.address,
    case_number: inc.case_number,
    source: inc.source,
    raw_data: inc.raw_data,
    location: inc.latitude && inc.longitude 
      ? `POINT(${inc.longitude} ${inc.latitude})`
      : null,
  }));

  const { error } = await supabase.from('crime_incidents').insert(rows);
  
  if (error) {
    if (error.message.includes('duplicate')) {
      let inserted = 0;
      for (const row of rows) {
        const { error: singleError } = await supabase.from('crime_incidents').insert([row]);
        if (!singleError) inserted++;
      }
      return inserted;
    }
    console.error(`    Insert error: ${error.message}`);
    return 0;
  }
  
  return incidents.length;
}

// ============ SOCRATA ENDPOINTS ============

interface SocrataConfig {
  city: string;
  state: string;
  domain: string;
  datasetId: string;
  dateField: string;
  offenseField: string;
  latField?: string;
  lonField?: string;
  addressField?: string;
  caseField?: string;
}

const SOCRATA_CITIES: SocrataConfig[] = [
  {
    city: 'Chicago',
    state: 'IL',
    domain: 'data.cityofchicago.org',
    datasetId: 'ijzp-q8t2',
    dateField: 'date',
    offenseField: 'primary_type',
    latField: 'latitude',
    lonField: 'longitude',
    addressField: 'block',
    caseField: 'case_number',
  },
  {
    city: 'Dallas',
    state: 'TX',
    domain: 'www.dallasopendata.com',
    datasetId: 'qv6i-rri7',
    dateField: 'date1',
    offenseField: 'nibrs_crime_category',
    addressField: 'location1',
    caseField: 'servnumb',
  },
  {
    city: 'Kansas City',
    state: 'MO',
    domain: 'data.kcmo.org',
    datasetId: 'isbe-v4d8',
    dateField: 'from_date',
    offenseField: 'description',
    addressField: 'address',
    caseField: 'report_no',
  },
  {
    city: 'Honolulu',
    state: 'HI',
    domain: 'data.honolulu.gov',
    datasetId: 'vg88-5rn5',
    dateField: 'date',
    offenseField: 'type',
    addressField: 'blockaddress',
    caseField: 'incidentnum',
  },
  {
    city: 'Providence',
    state: 'RI',
    domain: 'data.providenceri.gov',
    datasetId: 'rz3y-pz8v',
    dateField: 'reported_date',
    offenseField: 'statute_desc',
    latField: 'lat',
    lonField: 'lng',
    addressField: 'location',
    caseField: 'case_number',
  },
  {
    city: 'Norfolk',
    state: 'VA',
    domain: 'data.norfolk.gov',
    datasetId: 'r7bn-2egr',
    dateField: 'date_occu',
    offenseField: 'offense',
    addressField: 'street',
    caseField: 'inci_id',
  },
];

async function ingestSocrataCity(config: SocrataConfig): Promise<number> {
  console.log(`\n  ${config.city}, ${config.state}...`);
  
  const startDate = '2024-01-01';
  let totalInserted = 0;
  let offset = 0;
  const limit = 10000;
  
  while (true) {
    const url = `https://${config.domain}/resource/${config.datasetId}.json?$where=${config.dateField}>='${startDate}'&$limit=${limit}&$offset=${offset}&$order=${config.dateField} DESC`;
    
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) {
        console.log(`    API error: ${res.status}`);
        break;
      }
      
      const data = await res.json();
      if (!data || data.length === 0) break;
      
      const incidents: CrimeIncident[] = [];
      for (const record of data) {
        const dateVal = record[config.dateField];
        if (!dateVal) continue;
        
        let lat: number | undefined;
        let lon: number | undefined;
        
        if (config.latField && config.lonField) {
          lat = parseFloat(record[config.latField]);
          lon = parseFloat(record[config.lonField]);
          if (isNaN(lat) || isNaN(lon)) {
            lat = undefined;
            lon = undefined;
          }
        }
        
        // Handle location object (Kansas City uses this format)
        if (!lat && record.location?.coordinates) {
          [lon, lat] = record.location.coordinates;
        }
        
        const offense = record[config.offenseField] || '';
        
        incidents.push({
          city: config.city,
          state: config.state,
          incident_date: dateVal,
          offense_type: offense,
          normalized_type: normalizeOffenseType(offense),
          address: config.addressField ? record[config.addressField] : null,
          case_number: config.caseField ? record[config.caseField] : null,
          source: `${config.city} Socrata`,
          latitude: lat,
          longitude: lon,
          raw_data: record,
        });
      }
      
      // Insert in batches
      for (let i = 0; i < incidents.length; i += BATCH_SIZE) {
        const batch = incidents.slice(i, i + BATCH_SIZE);
        const inserted = await insertBatch(batch);
        totalInserted += inserted;
      }
      
      process.stdout.write(`    ${offset + data.length} fetched, ${totalInserted} inserted...\r`);
      
      if (data.length < limit) break;
      offset += limit;
      
    } catch (err: any) {
      console.log(`    Fetch error: ${err.message}`);
      break;
    }
  }
  
  console.log(`    Done: ${totalInserted} records inserted`);
  return totalInserted;
}

// ============ ARCGIS ENDPOINTS ============

interface ArcGISConfig {
  city: string;
  state: string;
  serviceUrl: string;
  layerId: number;
  dateField: string;
  offenseField: string;
  addressField?: string;
  caseField?: string;
}

const ARCGIS_CITIES: ArcGISConfig[] = [
  {
    city: 'Louisville',
    state: 'KY',
    serviceUrl: 'https://services1.arcgis.com/79kfd2K6fskCAkyg/arcgis/rest/services/crime_data_2025/FeatureServer',
    layerId: 0,
    dateField: 'DATE_REPORTED',
    offenseField: 'CRIME_TYPE',
    addressField: 'BLOCK_ADDRESS',
    caseField: 'INCIDENT_NUMBER',
  },
  {
    city: 'Indianapolis',
    state: 'IN',
    serviceUrl: 'https://gis.indy.gov/server/rest/services/IMPD/IMPD_Public_Data/MapServer',
    layerId: 0,
    dateField: 'OCCURRED_DT',
    offenseField: 'UCR_CATEGORY',
    addressField: 'ADDRESS',
    caseField: 'CASE_NUMBER',
  },
];

async function ingestArcGISCity(config: ArcGISConfig): Promise<number> {
  console.log(`\n  ${config.city}, ${config.state}...`);
  
  const cutoffMs = new Date('2024-01-01').getTime();
  let totalInserted = 0;
  let offset = 0;
  const limit = 2000;
  
  while (true) {
    const url = `${config.serviceUrl}/${config.layerId}/query?where=${config.dateField}>${cutoffMs}&outFields=*&returnGeometry=true&resultOffset=${offset}&resultRecordCount=${limit}&f=json`;
    
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.log(`    API error: ${res.status}`);
        break;
      }
      
      const data = await res.json();
      if (data.error) {
        console.log(`    API error: ${data.error.message}`);
        break;
      }
      
      const features = data.features || [];
      if (features.length === 0) break;
      
      const incidents: CrimeIncident[] = [];
      for (const feature of features) {
        const attrs = feature.attributes || {};
        const geom = feature.geometry;
        
        const dateVal = attrs[config.dateField];
        if (!dateVal) continue;
        
        let lat: number | undefined;
        let lon: number | undefined;
        
        if (geom?.x && geom?.y) {
          lon = geom.x;
          lat = geom.y;
        }
        
        const offense = attrs[config.offenseField] || '';
        const dateStr = new Date(dateVal).toISOString();
        
        incidents.push({
          city: config.city,
          state: config.state,
          incident_date: dateStr,
          offense_type: offense,
          normalized_type: normalizeOffenseType(offense),
          address: config.addressField ? attrs[config.addressField] : null,
          case_number: config.caseField ? attrs[config.caseField] : null,
          source: `${config.city} ArcGIS`,
          latitude: lat,
          longitude: lon,
          raw_data: attrs,
        });
      }
      
      // Insert in batches
      for (let i = 0; i < incidents.length; i += BATCH_SIZE) {
        const batch = incidents.slice(i, i + BATCH_SIZE);
        const inserted = await insertBatch(batch);
        totalInserted += inserted;
      }
      
      process.stdout.write(`    ${offset + features.length} fetched, ${totalInserted} inserted...\r`);
      
      if (features.length < limit) break;
      offset += limit;
      
    } catch (err: any) {
      console.log(`    Fetch error: ${err.message}`);
      break;
    }
  }
  
  console.log(`    Done: ${totalInserted} records inserted`);
  return totalInserted;
}

// ============ MAIN ============

async function main() {
  console.log('='.repeat(60));
  console.log('Batch Crime Data Ingestion');
  console.log('='.repeat(60));
  console.log('Target: Cities missing recent crime data (2024+)');
  console.log('');
  
  let totalRecords = 0;
  
  console.log('\n--- SOCRATA ENDPOINTS ---');
  for (const config of SOCRATA_CITIES) {
    const count = await ingestSocrataCity(config);
    totalRecords += count;
  }
  
  console.log('\n--- ARCGIS ENDPOINTS ---');
  for (const config of ARCGIS_CITIES) {
    const count = await ingestArcGISCity(config);
    totalRecords += count;
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Total records inserted: ${totalRecords.toLocaleString()}`);
  console.log('='.repeat(60));
}

main().catch(console.error);
