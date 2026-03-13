import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verify() {
  // Direct count of churches
  const { count: totalCount } = await supabase
    .from('churches')
    .select('*', { count: 'exact', head: true });
  console.log(`Total churches in DB: ${totalCount}`);

  // Count churches with location
  const { data: withLocation, count: locCount } = await supabase
    .from('churches')
    .select('id, name, location', { count: 'exact' })
    .not('location', 'is', null)
    .limit(3);
  console.log(`Churches with location: ${locCount}`);
  console.log('Sample:', JSON.stringify(withLocation, null, 2));

  // Count Texas boundaries
  const { count: boundaryCount } = await supabase
    .from('boundaries')
    .select('*', { count: 'exact', head: true })
    .ilike('external_id', '48%');
  console.log(`Texas boundaries (external_id starts with 48): ${boundaryCount}`);

  // Check RPC function
  const { data: rpcData, error: rpcError } = await supabase.rpc('fn_get_churches_simple');
  if (rpcError) {
    console.log('RPC Error:', rpcError.message);
  } else {
    console.log(`fn_get_churches_simple returns: ${rpcData?.length || 0} churches`);
  }
}

verify().catch(console.error);
