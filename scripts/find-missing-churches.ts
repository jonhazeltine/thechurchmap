import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function findChurches() {
  // Search for Ignite and Mosaic churches
  const { data, error } = await supabase
    .from('churches')
    .select('id, name, city, source, external_id, county_fips, approved')
    .or('name.ilike.%ignite%,name.ilike.%mosaic%')
    .order('name');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`Found ${data?.length || 0} churches matching "ignite" or "mosaic":\n`);
  
  if (data && data.length > 0) {
    data.forEach(c => {
      console.log(`Name: ${c.name}`);
      console.log(`  City: ${c.city || 'N/A'}`);
      console.log(`  Source: ${c.source || 'manual'}`);
      console.log(`  County FIPS: ${c.county_fips || 'MISSING'}`);
      console.log(`  Approved: ${c.approved}`);
      console.log(`  ID: ${c.id}`);
      console.log('');
    });
  } else {
    console.log('No churches found with those names in the database.');
  }
}

findChurches().catch(console.error);
