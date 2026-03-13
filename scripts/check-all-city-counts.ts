import { createClient } from '@supabase/supabase-js';
import { ARCGIS_ENDPOINTS, SOCRATA_ENDPOINTS, CARTO_ENDPOINTS, CKAN_ENDPOINTS } from './config/crime-sources';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getCityCount(city: string, state: string): Promise<number> {
  const { count, error } = await supabase
    .from('crime_incidents')
    .select('*', { count: 'exact', head: true })
    .eq('city', city)
    .eq('state', state);
  
  if (error) return -1;
  return count || 0;
}

async function main() {
  console.log('Checking all city crime incident counts...\n');
  
  // Get total count first
  const { count: total } = await supabase
    .from('crime_incidents')
    .select('*', { count: 'exact', head: true });
  
  console.log('TOTAL RECORDS:', total?.toLocaleString(), '\n');
  console.log('='.repeat(80));
  console.log('City'.padEnd(25) + 'State'.padEnd(8) + 'Type'.padEnd(10) + 'Count'.padEnd(15) + 'Status');
  console.log('='.repeat(80));
  
  const allEndpoints = [
    ...SOCRATA_ENDPOINTS.map(e => ({ ...e, srcType: 'socrata' })),
    ...ARCGIS_ENDPOINTS.map(e => ({ ...e, srcType: 'arcgis' })),
    ...CARTO_ENDPOINTS.map(e => ({ ...e, srcType: 'carto' })),
    ...CKAN_ENDPOINTS.map(e => ({ ...e, srcType: 'ckan' })),
  ];
  
  const results: { city: string; state: string; srcType: string; count: number }[] = [];
  
  for (const ep of allEndpoints) {
    const count = await getCityCount(ep.name, ep.state);
    results.push({ city: ep.name, state: ep.state, srcType: ep.srcType, count });
  }
  
  // Sort by count descending
  results.sort((a, b) => b.count - a.count);
  
  let completed = 0;
  let incomplete = 0;
  
  for (const r of results) {
    const status = r.count > 0 ? 'Has data' : 'No data';
    if (r.count > 0) completed++; else incomplete++;
    console.log(
      r.city.padEnd(25) + 
      r.state.padEnd(8) + 
      r.srcType.padEnd(10) + 
      r.count.toLocaleString().padEnd(15) + 
      status
    );
  }
  
  console.log('='.repeat(80));
  console.log('\nSummary:', completed, 'cities with data,', incomplete, 'cities need ingestion');
  
  // List cities that need ingestion
  const needsIngestion = results.filter(r => r.count === 0);
  if (needsIngestion.length > 0) {
    console.log('\nCities needing ingestion:');
    for (const r of needsIngestion) {
      console.log('  -', r.city + ',', r.state, '(' + r.srcType + ')');
    }
  }
}

main().catch(console.error);
