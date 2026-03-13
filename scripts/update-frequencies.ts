import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const frequencyByType: Record<string, string> = {
  crime: 'Daily',
  health: 'Monthly',
  demographics: 'Monthly',
  boundaries: 'Yearly',
  churches: 'Weekly',
};

async function updateFrequencies() {
  console.log('Updating data source frequencies...\n');

  for (const [sourceType, frequency] of Object.entries(frequencyByType)) {
    const { data, error } = await supabase
      .from('data_source_config')
      .update({ 
        frequency_label: frequency,
        updated_at: new Date().toISOString()
      })
      .eq('source_type', sourceType)
      .select('source_key');

    if (error) {
      console.error(`Error updating ${sourceType}:`, error.message);
    } else {
      console.log(`✅ ${sourceType.toUpperCase()}: Set ${data?.length || 0} sources to ${frequency}`);
    }
  }

  console.log('\nDone! Frequencies updated.');
}

updateFrequencies().catch(console.error);
