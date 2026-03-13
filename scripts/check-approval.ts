import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkApproval() {
  // Count approved vs not approved
  const { data, error } = await supabase
    .from('churches')
    .select('source, approved')
    .limit(10000);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  const stats = {
    'manual_approved': 0,
    'manual_not_approved': 0,
    'osm_approved': 0,
    'osm_not_approved': 0
  };
  
  data?.forEach(c => {
    const key = `${c.source === 'osm_mi_church' ? 'osm' : 'manual'}_${c.approved ? 'approved' : 'not_approved'}`;
    stats[key as keyof typeof stats]++;
  });
  
  console.log('Approval status breakdown:');
  console.log(`  Manual - Approved: ${stats.manual_approved}`);
  console.log(`  Manual - Not Approved: ${stats.manual_not_approved}`);
  console.log(`  OSM - Approved: ${stats.osm_approved}`);
  console.log(`  OSM - Not Approved: ${stats.osm_not_approved}`);
  console.log(`\nTotal approved: ${stats.manual_approved + stats.osm_approved}`);
  console.log(`Total not approved: ${stats.manual_not_approved + stats.osm_not_approved}`);
}

checkApproval().catch(console.error);
