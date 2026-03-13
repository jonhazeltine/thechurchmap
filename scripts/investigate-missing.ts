import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function investigate() {
  // Check if there are any OSM churches that match the deleted names
  const missingNames = [
    'Holy Spirit', 'Holy Trinity Catholic Church', 'Grace Bible Fellowship',
    'New Life', 'First Reformed Church – Holland', 'St Nicholas Church'
  ];
  
  console.log('Checking if common church names exist in OSM data...');
  
  for (const name of missingNames) {
    const { data, error } = await supabase
      .from('churches')
      .select('id, name, source')
      .ilike('name', `%${name}%`)
      .limit(10);
    
    if (data && data.length > 0) {
      console.log(`\n"${name}" matches:`);
      data.forEach(c => console.log(`  - ${c.name} (${c.source})`));
    }
  }
  
  // Count total by approval status
  const { count: approvedCount } = await supabase
    .from('churches')
    .select('*', { count: 'exact', head: true })
    .eq('approved', true);
  
  const { count: totalCount } = await supabase
    .from('churches')
    .select('*', { count: 'exact', head: true });
  
  console.log(`\nApproved: ${approvedCount}`);
  console.log(`Total: ${totalCount}`);
}

investigate().catch(console.error);
