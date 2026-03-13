import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function searchAll() {
  // Get all manual churches to see what's there
  const { data, error } = await supabase
    .from('churches')
    .select('id, name, city')
    .is('source', null)  // Manual churches have null source
    .order('name')
    .limit(300);
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`All ${data?.length || 0} manual churches:\n`);
  data?.forEach(c => {
    console.log(`${c.name} - ${c.city || 'N/A'}`);
  });
}

searchAll().catch(console.error);
