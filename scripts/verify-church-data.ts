import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function verify() {
  // Check approval status
  const { data: approvalData } = await supabase
    .from('churches')
    .select('source, approved')
    .limit(10000);
  
  const stats = {
    manual_approved: 0, manual_not_approved: 0,
    osm_approved: 0, osm_not_approved: 0
  };
  
  approvalData?.forEach(c => {
    const key = `${c.source === 'osm_mi_church' ? 'osm' : 'manual'}_${c.approved ? 'approved' : 'not_approved'}`;
    stats[key as keyof typeof stats]++;
  });
  
  console.log('Approval status:');
  console.log(`  Manual approved: ${stats.manual_approved}`);
  console.log(`  Manual not approved: ${stats.manual_not_approved}`);
  console.log(`  OSM approved: ${stats.osm_approved}`);
  console.log(`  OSM not approved: ${stats.osm_not_approved}`);
  
  // Check county_fips
  const { data: fipsData } = await supabase
    .from('churches')
    .select('source, county_fips')
    .limit(10000);
  
  let osmWithFips = 0, osmWithoutFips = 0;
  let manualWithFips = 0, manualWithoutFips = 0;
  
  fipsData?.forEach(c => {
    if (c.source === 'osm_mi_church') {
      if (c.county_fips) osmWithFips++; else osmWithoutFips++;
    } else {
      if (c.county_fips) manualWithFips++; else manualWithoutFips++;
    }
  });
  
  console.log('\nCounty FIPS status:');
  console.log(`  Manual with county_fips: ${manualWithFips}`);
  console.log(`  Manual without county_fips: ${manualWithoutFips}`);
  console.log(`  OSM with county_fips: ${osmWithFips}`);
  console.log(`  OSM without county_fips: ${osmWithoutFips}`);
}

verify().catch(console.error);
