import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function debug() {
  // Get raw sample of churches with location
  const { data } = await supabase
    .from('churches')
    .select('id, name, location')
    .not('location', 'is', null)
    .limit(3);
  
  console.log('Raw location data:');
  for (const c of data || []) {
    console.log(`\nChurch: ${c.name}`);
    console.log('Location type:', typeof c.location);
    console.log('Location value:', JSON.stringify(c.location, null, 2));
  }
}

debug().catch(console.error);
