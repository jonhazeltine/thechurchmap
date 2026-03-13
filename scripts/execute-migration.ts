import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function executeMigration() {
  console.log('Attempting to execute migration 0021...\n');
  
  const migrationSQL = `
ALTER TABLE public.boundaries DROP CONSTRAINT IF EXISTS boundaries_type_check;

ALTER TABLE public.boundaries
  ADD CONSTRAINT boundaries_type_check
  CHECK (type IN ('county','city','zip','neighborhood','school_district','place','other'));
`;

  try {
    const { data, error } = await supabase.rpc('exec', {
      sql: migrationSQL
    });
    
    if (error) {
      console.error('Migration execution failed:', error);
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
    
    console.log('✓ Migration executed successfully!');
    console.log('The boundaries table now accepts type="place"');
    return true;
    
  } catch (err: any) {
    console.error('Unexpected error:', err.message);
    console.log('\n' + '='.repeat(70));
    console.log('MANUAL EXECUTION REQUIRED');
    console.log('='.repeat(70));
    console.log('\nPlease run this SQL in the Supabase SQL Editor:\n');
    console.log(migrationSQL);
    console.log('\n' + '='.repeat(70));
    process.exit(1);
  }
}

executeMigration();
