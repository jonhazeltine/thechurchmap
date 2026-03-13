import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { count: start } = await supabase.from('crime_incidents').select('*', { count: 'exact', head: true }).eq('city', 'San Diego');
  console.log('🚀 Starting from:', start?.toLocaleString());
  let cur = start || 0;
  
  while (cur < 682344) {
    try {
      const res = await fetch(`https://opendata.sandag.org/resource/pr74-d3tr.json?$limit=10000&$offset=${cur}&$order=incidentuid`);
      const data = await res.json();
      
      if (!data || !Array.isArray(data) || !data.length) { 
        console.log('✅ Done! Total:', cur.toLocaleString()); 
        break; 
      }
      
      // Use correct column names matching existing schema
      const rows = data.map(r => ({ 
        city: 'San Diego', 
        state: 'CA', 
        incident_date: r.incident_date || null, 
        offense_type: r.cibrs_offense_description || null, 
        address: r.block_address || null,
        case_number: r.incidentuid || null,
        source: 'sandiego_socrata',
        raw_data: {
          beat: r.beat,
          zip_code: r.zip_code,
          agency: r.agency,
          crime_category: r.crime_against_category
        }
      }));
      
      const { error } = await supabase.from('crime_incidents').insert(rows);
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
