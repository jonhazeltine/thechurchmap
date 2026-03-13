/**
 * Migration script to make church_id nullable in prayers table
 * Run this to support global and regional prayers
 */
import { supabaseServer } from '../lib/supabaseServer';

async function migrate() {
  const supabase = supabaseServer();
  
  console.log('🔄 Making church_id nullable in prayers table...');
  
  // Step 1: Make church_id nullable
  const { error: alterError } = await supabase.rpc('exec_sql', {
    sql: `
      ALTER TABLE public.prayers 
        ALTER COLUMN church_id DROP NOT NULL;
    `
  });
  
  if (alterError) {
    console.error('❌ Error making church_id nullable:', alterError);
    return;
  }
  
  console.log('✅ church_id is now nullable');
  
  // Step 2: Add check constraint
  const { error: constraintError } = await supabase.rpc('exec_sql', {
    sql: `
      ALTER TABLE public.prayers
        DROP CONSTRAINT IF EXISTS prayers_scope_check;
        
      ALTER TABLE public.prayers
        ADD CONSTRAINT prayers_scope_check 
        CHECK (
          (church_id IS NOT NULL AND global = false AND region_type IS NULL)
          OR
          (church_id IS NULL AND (global = true OR region_type IS NOT NULL))
        );
    `
  });
  
  if (constraintError) {
    console.error('❌ Error adding check constraint:', constraintError);
    return;
  }
  
  console.log('✅ Check constraint added');
  
  // Step 3: Update indexes
  const { error: indexError } = await supabase.rpc('exec_sql', {
    sql: `
      DROP INDEX IF EXISTS idx_prayers_church_id;
      DROP INDEX IF EXISTS idx_prayers_church_status;
      DROP INDEX IF EXISTS idx_prayers_church_created;
      
      CREATE INDEX idx_prayers_church_id ON public.prayers(church_id) WHERE church_id IS NOT NULL;
      CREATE INDEX idx_prayers_church_status ON public.prayers(church_id, status) WHERE church_id IS NOT NULL;
      CREATE INDEX idx_prayers_church_created ON public.prayers(church_id, created_at DESC) WHERE church_id IS NOT NULL;
      
      CREATE INDEX IF NOT EXISTS idx_prayers_global ON public.prayers(global, status) WHERE global = true;
      CREATE INDEX IF NOT EXISTS idx_prayers_regional ON public.prayers(region_type, region_id, status) WHERE region_type IS NOT NULL;
    `
  });
  
  if (indexError) {
    console.error('❌ Error updating indexes:', indexError);
    return;
  }
  
  console.log('✅ Indexes updated');
  console.log('🎉 Migration complete!');
}

migrate().catch(console.error);
