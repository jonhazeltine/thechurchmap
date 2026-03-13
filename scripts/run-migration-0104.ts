/**
 * Migration script to add fn_get_platform_churches_for_verification RPC function
 * This enables fetching ALL platform churches (including unapproved) with GeoJSON locations
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables:');
  console.error('- VITE_SUPABASE_URL or SUPABASE_URL');
  console.error('- SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('Running migration 0104: Add fn_get_platform_churches_for_verification function...');
  
  const migrationSQL = readFileSync('db/migrations/0104-fn-get-platform-churches-verification.sql', 'utf-8');
  
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: migrationSQL
  });
  
  if (error) {
    console.error('Migration failed using RPC:', error);
    console.log('\n' + '='.repeat(70));
    console.log('MANUAL EXECUTION REQUIRED');
    console.log('='.repeat(70));
    console.log('\nPlease run this SQL in the Supabase SQL Editor:\n');
    console.log(migrationSQL);
    console.log('\nSteps:');
    console.log('1. Go to your Supabase Dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Create a new query');
    console.log('4. Paste the SQL above');
    console.log('5. Click "Run"');
    console.log('\n' + '='.repeat(70));
    process.exit(1);
  }
  
  console.log('✅ Migration completed successfully!');
  console.log('The fn_get_platform_churches_for_verification function is now available.');
  return data;
}

runMigration()
  .then((result) => {
    console.log('Result:', result);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
