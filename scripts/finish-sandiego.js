const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { count: start } = await supabase.from('crime_incidents').select('*', { count: 'exact', head: true }).eq('city', 'San Diego');
  console.log('🚀 Starting from:', start?.toLocaleString());
  let cur = start || 0;
  
  while (cur < 682344) {
    try {
      const res = await fetch(`https://opendata.sandag.org/resource/pr74-d3tr.json?$limit=10000&$offset=${cur}&$order=incident_number`);
      const data = await res.json();
      
      if (!data || !Array.isArray(data) || !data.length) { 
        console.log('✅ Done! Total:', cur.toLocaleString()); 
        break; 
      }
      
      const rows = data.map(r => ({ 
        source_id: 'sandiego_' + (r.incidentuid || r.incident_number || cur + Math.random()), 
        city: 'San Diego', 
        state: 'CA', 
        incident_date: r.incident_date?.split('T')[0] || null, 
        offense_type: r.cibrs_offense_description || r.charge_description || null, 
        offense_category: r.crime_against_category || r.activity_type || null, 
        location_name: r.block_address || r.address_street || null, 
        source_url: 'https://opendata.sandag.org' 
      }));
      
      const { error } = await supabase.from('crime_incidents').upsert(rows, { onConflict: 'source_id' });
      if (error) console.log('⚠️ DB Error:', error.message);
      
      cur += data.length;
      const pct = ((cur / 682344) * 100).toFixed(1);
      console.log(`📦 ${cur.toLocaleString()} / 682,344 (${pct}%)`);
      
    } catch (e) {
      console.log('❌ Error:', e.message, '- retrying in 3s...');
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

run();
