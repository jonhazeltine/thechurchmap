import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function enableDCCumulative() {
  // Find DC crime data source
  const { data: sources, error: findError } = await supabase
    .from('data_source_config')
    .select('id, source_key, source_name, cumulative_mode')
    .ilike('source_key', '%dc%');

  if (findError) {
    console.error('Error finding DC source:', findError.message);
    return;
  }

  console.log('Found DC sources:', sources);

  if (!sources || sources.length === 0) {
    // Try searching by name
    const { data: byName } = await supabase
      .from('data_source_config')
      .select('id, source_key, source_name, cumulative_mode')
      .or('source_name.ilike.%washington%,source_name.ilike.%district%');
    
    console.log('Search by name:', byName);
    return;
  }

  // Enable cumulative mode for DC
  for (const source of sources) {
    if (source.source_key.includes('crime') || source.source_name.toLowerCase().includes('crime')) {
      const { data, error } = await supabase
        .from('data_source_config')
        .update({ 
          cumulative_mode: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', source.id)
        .select();

      if (error) {
        console.error(`Error updating ${source.source_key}:`, error.message);
      } else {
        console.log(`✅ Enabled cumulative mode for: ${source.source_name} (${source.source_key})`);
      }
    }
  }
}

enableDCCumulative().catch(console.error);
