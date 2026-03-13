import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function clearAllPrayers() {
  console.log('🗑️ Clearing all prayer interactions...');
  const { error: interactionsError } = await supabase
    .from('prayer_interactions')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (interactionsError) {
    console.error('Error deleting interactions:', interactionsError.message);
  } else {
    console.log('✅ Deleted all prayer interactions');
  }

  console.log('🗑️ Clearing all prayers...');
  const { error: prayersError } = await supabase
    .from('prayers')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (prayersError) {
    console.error('Error deleting prayers:', prayersError.message);
  } else {
    console.log('✅ Deleted all prayers');
  }

  console.log('Done!');
}

clearAllPrayers();
