import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function createFunction() {
  const sql = `
    CREATE OR REPLACE FUNCTION fn_get_boundaries_for_church(
      church_lat double precision,
      church_lon double precision
    )
    RETURNS TABLE(id uuid, name text, type text, area double precision) AS $$
    BEGIN
      RETURN QUERY
      SELECT 
        b.id,
        b.name,
        b.type,
        ST_Area(b.geometry::geography) as area
      FROM boundaries b
      WHERE b.type IN ('place', 'county subdivision')
        AND b.geometry IS NOT NULL
        AND ST_Contains(
          b.geometry,
          ST_SetSRID(ST_MakePoint(church_lon, church_lat), 4326)
        )
      ORDER BY area DESC;
    END;
    $$ LANGUAGE plpgsql;
  `;

  // Use the Supabase REST API directly
  const url = process.env.SUPABASE_URL!.replace('.supabase.co', '.supabase.co/rest/v1/rpc/');
  
  // Try using the SQL endpoint
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!response.ok) {
    console.log('Direct SQL exec not available. Trying alternative...');
    
    // Alternative: Use database URL directly with pg
    console.log('\nSQL to run manually in Supabase SQL Editor:');
    console.log('='.repeat(60));
    console.log(sql);
    console.log('='.repeat(60));
    
    return false;
  }
  
  console.log('Function created successfully!');
  return true;
}

createFunction().catch(console.error);
