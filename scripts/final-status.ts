import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function finalStatus() {
  // Count by source
  const { data: churches } = await supabase
    .from('churches')
    .select('source, approved, county_fips')
    .limit(10000);
  
  const stats = {
    manual: { total: 0, approved: 0, withFips: 0 },
    osm: { total: 0, approved: 0, withFips: 0 }
  };
  
  churches?.forEach(c => {
    const key = c.source === 'osm_mi_church' ? 'osm' : 'manual';
    stats[key].total++;
    if (c.approved) stats[key].approved++;
    if (c.county_fips) stats[key].withFips++;
  });
  
  console.log('='.repeat(60));
  console.log('FINAL DATABASE STATUS');
  console.log('='.repeat(60));
  console.log(`\nManual Churches: ${stats.manual.total}`);
  console.log(`  - Approved: ${stats.manual.approved}`);
  console.log(`  - With county_fips: ${stats.manual.withFips}`);
  console.log(`\nOSM Churches: ${stats.osm.total}`);
  console.log(`  - Approved: ${stats.osm.approved}`);
  console.log(`  - With county_fips: ${stats.osm.withFips}`);
  console.log(`\nTOTAL: ${stats.manual.total + stats.osm.total}`);
  
  // Check Ignite and Mosaic specifically
  const { data: special } = await supabase
    .from('churches')
    .select('name, city, county_fips, approved, id')
    .or('name.ilike.%ignite%,name.ilike.%mosaic%');
  
  console.log('\n' + '='.repeat(60));
  console.log('IGNITE & MOSAIC STATUS');
  console.log('='.repeat(60));
  special?.forEach(c => {
    console.log(`\n${c.name}`);
    console.log(`  ID: ${c.id}`);
    console.log(`  City: ${c.city || 'N/A'}`);
    console.log(`  County FIPS: ${c.county_fips || 'MISSING'}`);
    console.log(`  Approved: ${c.approved}`);
  });
}

finalStatus().catch(console.error);
