import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function findChurch() {
  const { data, error } = await supabase
    .from('churches')
    .select('id, name, source, approved, city, address')
    .ilike('name', '%buck creek%');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  if (data && data.length > 0) {
    console.log('Found churches matching "buck creek":');
    data.forEach(c => {
      console.log(`  - ${c.name} (${c.source}, approved: ${c.approved})`);
      console.log(`    Address: ${c.address}, ${c.city}`);
      console.log(`    ID: ${c.id}`);
    });
  } else {
    console.log('No churches found matching "buck creek"');
  }
}

findChurch().catch(console.error);
