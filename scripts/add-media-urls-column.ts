import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addMediaUrlsColumn() {
  console.log('Adding media_urls column to posts table...');
  
  const { error } = await supabase.rpc('exec_sql', {
    sql: `ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_urls text[] DEFAULT '{}'::text[];`
  });

  if (error) {
    console.error('RPC error, trying direct SQL approach...');
    // Try a different approach - update via REST if RPC isn't available
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        sql: `ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_urls text[] DEFAULT '{}'::text[];`
      })
    });
    
    if (!response.ok) {
      console.log('Direct SQL not available. Please run this SQL in your Supabase SQL editor:');
      console.log('');
      console.log("ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_urls text[] DEFAULT '{}'::text[];");
      console.log('');
    }
  } else {
    console.log('✅ Added media_urls column successfully');
  }
}

addMediaUrlsColumn();
