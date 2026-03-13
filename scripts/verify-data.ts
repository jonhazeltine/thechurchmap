import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verify() {
  console.log("=== Database Verification ===\n");
  
  // Total churches
  const { count: totalChurches } = await supabase
    .from('churches')
    .select('*', { count: 'exact', head: true });
  console.log(`Total churches: ${totalChurches}`);
  
  // Churches with location
  const { count: withLocation } = await supabase
    .from('churches')
    .select('*', { count: 'exact', head: true })
    .not('location', 'is', null);
  console.log(`Churches with location: ${withLocation}`);
  
  // Sample Texas church (should have external_id starting with 'osm:')
  const { data: txSample } = await supabase
    .from('churches')
    .select('id, name, external_id, address, state')
    .or('state.ilike.%Texas%,state.ilike.%TX%,state.eq.TX')
    .limit(3);
  console.log(`\nTexas church samples: ${JSON.stringify(txSample, null, 2)}`);
  
  // Boundaries by type
  console.log("\n=== Boundaries by Type ===");
  for (const type of ['place', 'county', 'census_tract', 'zip']) {
    const { count } = await supabase
      .from('boundaries')
      .select('*', { count: 'exact', head: true })
      .eq('type', type);
    console.log(`${type}: ${count}`);
  }
  
  // Texas boundaries (FIPS 48)
  console.log("\n=== Texas Boundaries (FIPS 48) ===");
  for (const type of ['place', 'county', 'census_tract']) {
    const { count } = await supabase
      .from('boundaries')
      .select('*', { count: 'exact', head: true })
      .eq('type', type)
      .ilike('external_id', '48%');
    console.log(`Texas ${type}: ${count}`);
  }
}

verify().catch(console.error);
