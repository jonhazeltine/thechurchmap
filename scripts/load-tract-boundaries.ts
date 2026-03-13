import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TractFeature {
  attributes: {
    GEOID: string;
    BASENAME?: string;
    NAME?: string;
    STATE: string;
    COUNTY?: string;
  };
  geometry: {
    rings: number[][][];
  };
}

const STATE_FIPS_MAP: Record<string, string> = {
  'AL': '01', 'AK': '02', 'AZ': '04', 'AR': '05', 'CA': '06', 'CO': '08',
  'CT': '09', 'DE': '10', 'DC': '11', 'FL': '12', 'GA': '13', 'HI': '15',
  'ID': '16', 'IL': '17', 'IN': '18', 'IA': '19', 'KS': '20', 'KY': '21',
  'LA': '22', 'ME': '23', 'MD': '24', 'MA': '25', 'MI': '26', 'MN': '27',
  'MS': '28', 'MO': '29', 'MT': '30', 'NE': '31', 'NV': '32', 'NH': '33',
  'NJ': '34', 'NM': '35', 'NY': '36', 'NC': '37', 'ND': '38', 'OH': '39',
  'OK': '40', 'OR': '41', 'PA': '42', 'RI': '44', 'SC': '45', 'SD': '46',
  'TN': '47', 'TX': '48', 'UT': '49', 'VT': '50', 'VA': '51', 'WA': '53',
  'WV': '54', 'WI': '55', 'WY': '56'
};

async function fetchTractsByCounty(stateFips: string, countyFips: string): Promise<TractFeature[]> {
  const url = new URL('https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/8/query');
  url.searchParams.set('where', `STATE='${stateFips}' AND COUNTY='${countyFips}'`);
  url.searchParams.set('outFields', 'GEOID,BASENAME,NAME,STATE,COUNTY');
  url.searchParams.set('returnGeometry', 'true');
  url.searchParams.set('geometryPrecision', '6');
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('f', 'json');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TIGERweb request failed: ${response.status}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`TIGERweb error: ${data.error.message}`);
  }

  return data.features || [];
}

async function fetchCountiesInState(stateFips: string): Promise<string[]> {
  const url = new URL('https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query');
  url.searchParams.set('where', `STATE='${stateFips}'`);
  url.searchParams.set('outFields', 'COUNTY');
  url.searchParams.set('returnGeometry', 'false');
  url.searchParams.set('f', 'json');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TIGERweb counties request failed: ${response.status}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`TIGERweb error: ${data.error.message}`);
  }

  return (data.features || []).map((f: any) => f.attributes.COUNTY);
}

function ringsToWKT(rings: number[][][]): string {
  const polygons = rings.map(ring => {
    const coords = ring.map(([lng, lat]) => `${lng} ${lat}`).join(',');
    return `((${coords}))`;
  });
  
  if (polygons.length === 1) {
    return `MULTIPOLYGON(${polygons[0].replace(/^\(/, '((')})`
      .replace(/\)\)$/, ')))');
  }
  return `MULTIPOLYGON(${polygons.join(',')})`;
}

async function upsertTractBatch(batch: any[]): Promise<number> {
  const { data, error } = await supabase.rpc('fn_upsert_tract_boundaries', {
    p_tracts: JSON.stringify(batch)
  });
  
  if (error) {
    console.error(`  RPC Error: ${error.message}`);
    return 0;
  }
  
  return data || batch.length;
}

async function loadTractsForState(stateAbbr: string): Promise<number> {
  const stateFips = STATE_FIPS_MAP[stateAbbr];
  if (!stateFips) {
    console.error(`Unknown state: ${stateAbbr}`);
    return 0;
  }

  console.log(`\nLoading tracts for ${stateAbbr} (FIPS ${stateFips})...`);

  const counties = await fetchCountiesInState(stateFips);
  console.log(`  Found ${counties.length} counties`);

  let totalTracts = 0;
  const batchSize = 100;
  let currentBatch: any[] = [];

  for (let i = 0; i < counties.length; i++) {
    const countyFips = counties[i];
    try {
      const features = await fetchTractsByCounty(stateFips, countyFips);
      
      for (const feature of features) {
        if (!feature.geometry?.rings?.length) continue;

        const tract = {
          geoid: feature.attributes.GEOID,
          name: feature.attributes.NAME || feature.attributes.BASENAME,
          state_fips: stateFips,
          county_fips: feature.attributes.COUNTY,
          geom: ringsToWKT(feature.geometry.rings)
        };
        currentBatch.push(tract);

        if (currentBatch.length >= batchSize) {
          const count = await upsertTractBatch(currentBatch);
          totalTracts += count;
          currentBatch = [];
        }
      }

      if ((i + 1) % 10 === 0 || i === counties.length - 1) {
        process.stdout.write(`\r  Processing: ${i + 1}/${counties.length} counties, ${totalTracts + currentBatch.length} tracts`);
      }

      await new Promise(r => setTimeout(r, 50));
    } catch (err) {
      console.error(`\n  Error fetching county ${countyFips}: ${err}`);
    }
  }

  if (currentBatch.length > 0) {
    const count = await upsertTractBatch(currentBatch);
    totalTracts += count;
  }

  console.log(`\n  ✓ Loaded ${totalTracts} tracts for ${stateAbbr}`);
  return totalTracts;
}

async function main() {
  const args = process.argv.slice(2);
  const stateFilter = args.find(a => a.startsWith('--state='))?.split('=')[1];

  console.log('='.repeat(70));
  console.log('Load Census Tract Boundaries into Database');
  console.log('='.repeat(70));

  const statesToLoad = stateFilter 
    ? [stateFilter.toUpperCase()]
    : Object.keys(STATE_FIPS_MAP);

  let totalLoaded = 0;
  for (const state of statesToLoad) {
    const count = await loadTractsForState(state);
    totalLoaded += count;
  }

  console.log('\n' + '='.repeat(70));
  console.log(`Total tracts loaded: ${totalLoaded.toLocaleString()}`);
  console.log('='.repeat(70));
}

main().catch(console.error);
