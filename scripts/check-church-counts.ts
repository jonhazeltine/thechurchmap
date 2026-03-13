import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function checkChurches() {
  // Count by source
  const { data: counts, error } = await supabase
    .from('churches')
    .select('source')
    .limit(10000);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  const sourceCounts: Record<string, number> = {};
  counts?.forEach(c => {
    sourceCounts[c.source || 'null'] = (sourceCounts[c.source || 'null'] || 0) + 1;
  });
  
  console.log('Church counts by source:');
  Object.entries(sourceCounts).forEach(([source, count]) => {
    console.log(`  ${source}: ${count}`);
  });
  console.log(`Total: ${counts?.length}`);
}

checkChurches().catch(console.error);
