/**
 * Crime Endpoint Configuration Audit
 * 
 * Validates that endpoint URLs actually match their labeled cities.
 * Catches configuration errors like the Atlanta/DC endpoint mixup.
 * 
 * Checks:
 * 1. URL hostname contains city name or related identifier
 * 2. Service name/path matches expected city
 * 3. Sample data coordinates fall within city bounds
 * 
 * Usage:
 *   npx tsx scripts/audit-endpoint-config.ts
 *   npx tsx scripts/audit-endpoint-config.ts --deep  # Fetch sample data from each endpoint
 */

import { 
  SOCRATA_ENDPOINTS, 
  ARCGIS_ENDPOINTS, 
  CKAN_ENDPOINTS, 
  CARTO_ENDPOINTS,
  ALL_ENDPOINTS,
  type CrimeEndpoint
} from './config/crime-sources';

// City bounding boxes [minLng, minLat, maxLng, maxLat]
const CITY_BOUNDS: Record<string, [number, number, number, number]> = {
  'Los Angeles,CA': [-118.7, 33.7, -117.6, 34.4],
  'San Francisco,CA': [-122.55, 37.65, -122.3, 37.85],
  'Oakland,CA': [-122.35, 37.7, -122.1, 37.9],
  'San Diego,CA': [-117.3, 32.5, -116.9, 33.2],
  'Sacramento,CA': [-121.6, 38.4, -121.2, 38.7],
  'Dallas,TX': [-97.1, 32.6, -96.5, 33.1],
  'Houston,TX': [-95.8, 29.5, -95.0, 30.2],
  'Austin,TX': [-98.0, 30.1, -97.5, 30.6],
  'San Antonio,TX': [-98.7, 29.2, -98.2, 29.7],
  'Fort Worth,TX': [-97.6, 32.5, -97.1, 32.95],
  'Chicago,IL': [-88.0, 41.6, -87.5, 42.1],
  'New York City,NY': [-74.3, 40.5, -73.7, 40.95],
  'Buffalo,NY': [-79.0, 42.8, -78.7, 43.0],
  'Seattle,WA': [-122.5, 47.4, -122.2, 47.75],
  'New Orleans,LA': [-90.2, 29.85, -89.85, 30.1],
  'Baton Rouge,LA': [-91.3, 30.3, -90.9, 30.6],
  'Memphis,TN': [-90.2, 34.95, -89.8, 35.25],
  'Nashville,TN': [-87.1, 35.95, -86.5, 36.4],
  'Chattanooga,TN': [-85.4, 34.95, -85.1, 35.15],
  'Kansas City,MO': [-94.8, 38.85, -94.4, 39.35],
  'Honolulu,HI': [-158.0, 21.25, -157.7, 21.45],
  'Cincinnati,OH': [-84.7, 39.0, -84.3, 39.25],
  'Cleveland,OH': [-81.9, 41.35, -81.5, 41.6],
  'Providence,RI': [-71.5, 41.75, -71.35, 41.9],
  'Little Rock,AR': [-92.5, 34.65, -92.1, 34.85],
  'Norfolk,VA': [-76.4, 36.8, -76.15, 36.95],
  'Virginia Beach,VA': [-76.2, 36.7, -75.9, 36.95],
  'Orlando,FL': [-81.55, 28.35, -81.2, 28.65],
  'Fort Lauderdale,FL': [-80.3, 26.05, -80.05, 26.25],
  'Montgomery County,MD': [-77.5, 38.9, -76.9, 39.35],
  'Baltimore,MD': [-76.75, 39.2, -76.5, 39.4],
  'Atlanta,GA': [-84.6, 33.6, -84.2, 34.0],
  'Detroit,MI': [-83.3, 42.25, -82.9, 42.5],
  'Grand Rapids,MI': [-85.8, 42.85, -85.5, 43.1],
  'Denver,CO': [-105.15, 39.6, -104.75, 39.95],
  'Charlotte,NC': [-81.0, 35.0, -80.6, 35.45],
  'Raleigh,NC': [-78.85, 35.65, -78.5, 35.95],
  'Indianapolis,IN': [-86.35, 39.6, -85.95, 39.95],
  'Las Vegas,NV': [-115.4, 35.95, -114.9, 36.35],
  'Washington DC,DC': [-77.15, 38.8, -76.9, 39.0],
  'Minneapolis,MN': [-93.4, 44.85, -93.15, 45.1],
  'Louisville,KY': [-85.9, 38.1, -85.5, 38.4],
  'Albuquerque,NM': [-106.8, 34.95, -106.4, 35.25],
  'Charleston,SC': [-80.15, 32.7, -79.85, 32.95],
  'Phoenix,AZ': [-112.4, 33.25, -111.8, 33.75],
  'Tucson,AZ': [-111.1, 32.1, -110.75, 32.35],
  'Tempe,AZ': [-111.98, 33.35, -111.85, 33.5],
  'Boise,ID': [-116.35, 43.5, -116.1, 43.7],
  'Omaha,NE': [-96.2, 41.15, -95.85, 41.35],
  'Tulsa,OK': [-96.15, 35.95, -95.75, 36.25],
  'Anchorage,AK': [-150.1, 61.05, -149.7, 61.35],
  'Milwaukee,WI': [-88.1, 42.9, -87.85, 43.2],
  'Pittsburgh,PA': [-80.15, 40.35, -79.85, 40.55],
  'Philadelphia,PA': [-75.3, 39.85, -74.95, 40.15],
};

// Known URL patterns that should match city names
const CITY_URL_PATTERNS: Record<string, string[]> = {
  'Los Angeles': ['lacity', 'losangeles', 'la.org'],
  'San Francisco': ['sfgov', 'sanfrancisco', 'sf.gov'],
  'Oakland': ['oaklandca', 'oakland'],
  'San Diego': ['sandag', 'sandiego'],
  'Sacramento': ['sacramento'],
  'Dallas': ['dallasopendata', 'dallas'],
  'Houston': ['houstontx', 'houston'],
  'Austin': ['austintexas', 'austin'],
  'San Antonio': ['sanantonio'],
  'Fort Worth': ['fortworthtexas', 'fortworthtexas.gov', 'fortworthtx'],
  'Chicago': ['cityofchicago', 'chicago'],
  'New York City': ['cityofnewyork', 'nyc', 'newyork'],
  'Buffalo': ['buffalony', 'buffalo'],
  'Seattle': ['seattle'],
  'New Orleans': ['nola', 'neworleans'],
  'Baton Rouge': ['brla', 'batonrouge'],
  'Memphis': ['memphistn', 'memphis'],
  'Nashville': ['nashville'],
  'Chattanooga': ['chattadata', 'chattanooga'],
  'Kansas City': ['kcmo', 'kansascity'],
  'Honolulu': ['honolulu'],
  'Cincinnati': ['cincinnati'],
  'Cleveland': ['cleveland'],
  'Providence': ['providenceri', 'providence'],
  'Little Rock': ['littlerock'],
  'Norfolk': ['norfolk'],
  'Virginia Beach': ['virginia'],
  'Orlando': ['orlando'],
  'Fort Lauderdale': ['fortlauderdale', 'ftlauderdale'],
  'Montgomery County': ['montgomerycounty'],
  'Baltimore': ['baltimore'],
  'Atlanta': ['atlanta', 'fulton'],
  'Detroit': ['detroit'],
  'Grand Rapids': ['grandrapids', 'grpd'],
  'Denver': ['denver'],
  'Charlotte': ['charlottenc', 'charlotte'],
  'Raleigh': ['raleigh'],
  'Indianapolis': ['indy', 'indianapolis'],
  'Las Vegas': ['lvmpd', 'lasvegas'],
  'Washington DC': ['dcgis', 'dc.gov'],
  'Minneapolis': ['minneapolis'],
  'Louisville': ['louisville'],
  'Albuquerque': ['cabq', 'albuquerque'],
  'Charleston': ['charleston'],
  'Phoenix': ['phoenix'],
  'Tucson': ['tucson', 'tpd'],
  'Tempe': ['tempe'],
  'Boise': ['boise', 'bpd'],
  'Omaha': ['omaha'],
  'Tulsa': ['tulsa'],
  'Anchorage': ['muni.org', 'anchorage'],
  'Milwaukee': ['milwaukee'],
  'Pittsburgh': ['wprdc', 'pittsburgh'],
  'Philadelphia': ['phl', 'philadelphia'],
};

interface AuditResult {
  endpoint: CrimeEndpoint;
  checks: {
    urlMatchesCity: boolean;
    urlPattern?: string;
    suspiciousPatterns: string[];
  };
  status: 'OK' | 'WARNING' | 'SUSPICIOUS';
}

function auditEndpoint(endpoint: CrimeEndpoint): AuditResult {
  const url = 'serviceUrl' in endpoint 
    ? endpoint.serviceUrl 
    : 'domain' in endpoint 
      ? endpoint.domain 
      : 'baseUrl' in endpoint 
        ? endpoint.baseUrl 
        : '';
  
  const urlLower = url.toLowerCase();
  const cityPatterns = CITY_URL_PATTERNS[endpoint.name] || [];
  
  // Check if URL contains expected city patterns
  const urlMatchesCity = cityPatterns.some(pattern => urlLower.includes(pattern.toLowerCase()));
  const matchedPattern = cityPatterns.find(pattern => urlLower.includes(pattern.toLowerCase()));
  
  // Look for suspicious patterns (other city names in URL)
  const suspiciousPatterns: string[] = [];
  for (const [otherCity, patterns] of Object.entries(CITY_URL_PATTERNS)) {
    if (otherCity === endpoint.name) continue;
    for (const pattern of patterns) {
      if (urlLower.includes(pattern.toLowerCase()) && pattern.length > 3) {
        suspiciousPatterns.push(`Contains "${pattern}" (associated with ${otherCity})`);
      }
    }
  }
  
  let status: AuditResult['status'] = 'OK';
  if (suspiciousPatterns.length > 0) {
    status = 'SUSPICIOUS';
  } else if (!urlMatchesCity && cityPatterns.length > 0) {
    status = 'WARNING';
  }
  
  return {
    endpoint,
    checks: {
      urlMatchesCity,
      urlPattern: matchedPattern,
      suspiciousPatterns,
    },
    status,
  };
}

async function fetchSampleAndValidate(endpoint: CrimeEndpoint): Promise<{
  success: boolean;
  sampleCoords?: { lat: number; lng: number }[];
  inBounds?: number;
  outOfBounds?: number;
  error?: string;
}> {
  const bounds = CITY_BOUNDS[`${endpoint.name},${endpoint.state}`];
  
  if (endpoint.type === 'arcgis') {
    try {
      const url = `${endpoint.serviceUrl}/${endpoint.layerId}/query?where=1=1&outFields=*&f=json&resultRecordCount=10`;
      const response = await fetch(url, { 
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'KingdomMapPlatform/1.0' }
      });
      
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }
      
      const data = await response.json();
      if (!data.features || data.features.length === 0) {
        return { success: true, sampleCoords: [], inBounds: 0, outOfBounds: 0 };
      }
      
      const coords: { lat: number; lng: number }[] = [];
      let inBounds = 0;
      let outOfBounds = 0;
      
      for (const feature of data.features) {
        const geom = feature.geometry;
        const attrs = feature.attributes;
        
        let lat: number | undefined;
        let lng: number | undefined;
        
        // Try geometry first
        if (geom && geom.y && geom.x) {
          lat = geom.y;
          lng = geom.x;
        }
        // Try attribute fields
        else if (endpoint.fieldMappings.latitude && endpoint.fieldMappings.longitude) {
          lat = parseFloat(attrs[endpoint.fieldMappings.latitude]);
          lng = parseFloat(attrs[endpoint.fieldMappings.longitude]);
        }
        
        if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
          coords.push({ lat, lng });
          
          if (bounds) {
            const [minLng, minLat, maxLng, maxLat] = bounds;
            if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
              inBounds++;
            } else {
              outOfBounds++;
            }
          }
        }
      }
      
      return { success: true, sampleCoords: coords, inBounds, outOfBounds };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
  
  // For other types, just return success without sample validation for now
  return { success: true };
}

async function main() {
  const args = process.argv.slice(2);
  const deepMode = args.includes('--deep');
  
  console.log('============================================================');
  console.log('Crime Endpoint Configuration Audit');
  console.log('============================================================\n');
  
  console.log(`Total endpoints: ${ALL_ENDPOINTS.length}`);
  console.log(`  Socrata: ${SOCRATA_ENDPOINTS.length}`);
  console.log(`  ArcGIS: ${ARCGIS_ENDPOINTS.length}`);
  console.log(`  CKAN: ${CKAN_ENDPOINTS.length}`);
  console.log(`  Carto: ${CARTO_ENDPOINTS.length}`);
  console.log('');
  
  const results: AuditResult[] = [];
  
  console.log('--- URL Pattern Checks ---\n');
  
  for (const endpoint of ALL_ENDPOINTS) {
    const result = auditEndpoint(endpoint);
    results.push(result);
    
    const url = 'serviceUrl' in endpoint 
      ? endpoint.serviceUrl 
      : 'domain' in endpoint 
        ? endpoint.domain 
        : 'baseUrl' in endpoint 
          ? endpoint.baseUrl 
          : '';
    
    if (result.status === 'SUSPICIOUS') {
      console.log(`❌ SUSPICIOUS: ${endpoint.name}, ${endpoint.state}`);
      console.log(`   URL: ${url}`);
      for (const pattern of result.checks.suspiciousPatterns) {
        console.log(`   ⚠️  ${pattern}`);
      }
      console.log('');
    } else if (result.status === 'WARNING') {
      console.log(`⚠️  WARNING: ${endpoint.name}, ${endpoint.state}`);
      console.log(`   URL: ${url}`);
      console.log(`   URL does not contain expected city patterns`);
      console.log('');
    }
  }
  
  const suspicious = results.filter(r => r.status === 'SUSPICIOUS');
  const warnings = results.filter(r => r.status === 'WARNING');
  const ok = results.filter(r => r.status === 'OK');
  
  console.log('--- Summary ---\n');
  console.log(`  ✅ OK: ${ok.length}`);
  console.log(`  ⚠️  Warnings: ${warnings.length}`);
  console.log(`  ❌ Suspicious: ${suspicious.length}`);
  
  if (deepMode) {
    console.log('\n--- Deep Validation (fetching sample data) ---\n');
    
    for (const result of results) {
      if (result.endpoint.type === 'arcgis') {
        process.stdout.write(`Checking ${result.endpoint.name}, ${result.endpoint.state}...`);
        const sampleResult = await fetchSampleAndValidate(result.endpoint);
        
        if (!sampleResult.success) {
          console.log(` ❌ Error: ${sampleResult.error}`);
        } else if (sampleResult.outOfBounds !== undefined && sampleResult.outOfBounds > 0) {
          const total = (sampleResult.inBounds || 0) + sampleResult.outOfBounds;
          const pct = (sampleResult.outOfBounds / total * 100).toFixed(0);
          if (parseInt(pct) > 50) {
            console.log(` ❌ MISLABELED! ${pct}% of sample coords out of bounds`);
            if (sampleResult.sampleCoords && sampleResult.sampleCoords.length > 0) {
              const sample = sampleResult.sampleCoords[0];
              console.log(`      Sample: [${sample.lat.toFixed(4)}, ${sample.lng.toFixed(4)}]`);
            }
          } else {
            console.log(` ⚠️  ${pct}% out of bounds`);
          }
        } else {
          console.log(` ✅ OK`);
        }
        
        // Rate limit
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }
  
  console.log('\n============================================================');
  console.log('Configuration audit complete!');
  if (!deepMode) {
    console.log('Run with --deep flag to validate sample data from each endpoint.');
  }
  console.log('============================================================');
}

main().catch(console.error);
