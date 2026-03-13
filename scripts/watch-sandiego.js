const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function watch() {
  while (true) {
    const { count } = await supabase.from('crime_incidents').select('*', { count: 'exact', head: true }).eq('city', 'San Diego');
    const pct = ((count / 682344) * 100).toFixed(1);
    const remaining = (682344 - count).toLocaleString();
    console.clear();
    console.log('📊 San Diego Crime Data Ingestion Progress');
    console.log('==========================================');
    console.log(`Current: ${count?.toLocaleString()} / 682,344`);
    console.log(`Progress: ${pct}%`);
    console.log(`Remaining: ${remaining}`);
    console.log(`Last updated: ${new Date().toLocaleTimeString()}`);
    await new Promise(r => setTimeout(r, 5000));
  }
}

watch();
