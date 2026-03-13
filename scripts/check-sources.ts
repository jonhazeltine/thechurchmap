import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkSources() {
  // Get distinct sources
  const { data: sourceData } = await supabase
    .from('churches')
    .select('source')
    .limit(10000);
  
  const sources: Record<string, number> = {};
  sourceData?.forEach(c => {
    const src = c.source || 'NULL';
    sources[src] = (sources[src] || 0) + 1;
  });
  
  console.log('Source distribution:');
  Object.entries(sources).forEach(([src, count]) => {
    console.log(`  ${src}: ${count}`);
  });

  // Now get all non-OSM churches (manual ones)
  const { data: manualChurches, error } = await supabase
    .from('churches')
    .select('id, name, city, source')
    .neq('source', 'osm_mi_church')
    .order('name');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`\nManual churches (source != osm_mi_church): ${manualChurches?.length || 0}`);
  console.log('\nListing first 50:');
  manualChurches?.slice(0, 50).forEach(c => {
    console.log(`  ${c.name} - ${c.city || 'N/A'} (source: ${c.source || 'NULL'})`);
  });
}

checkSources().catch(console.error);
