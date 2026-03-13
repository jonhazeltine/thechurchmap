import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function approveManualChurches() {
  const { data, error } = await supabase
    .from('churches')
    .update({ approved: true })
    .eq('source', 'manual')
    .eq('approved', false)
    .select('id');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`✅ Approved ${data?.length || 0} manual churches`);
}

approveManualChurches().catch(console.error);
