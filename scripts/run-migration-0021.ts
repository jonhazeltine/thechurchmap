import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('Running migration 0021: Add place boundary type...');
  
  const migrationSQL = readFileSync('db/migrations/0021-add-place-boundary-type.sql', 'utf-8');
  
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: migrationSQL
  });
  
  if (error) {
    console.error('Migration failed using RPC:', error);
    console.log('\nTrying alternative approach with direct SQL execution...');
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      db: { schema: 'public' }
    });
    
    const { error: error2 } = await supabaseAdmin.from('boundaries').select('type').limit(1);
    
    if (error2) {
      console.error('Could not verify boundaries table:', error2);
      process.exit(1);
    }
    
    console.log('\nPlease run this SQL manually in Supabase SQL Editor:');
    console.log('=' .repeat(60));
    console.log(migrationSQL);
    console.log('=' .repeat(60));
    
    process.exit(1);
  }
  
  console.log('Migration completed successfully!');
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
