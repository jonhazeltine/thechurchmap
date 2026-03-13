/**
 * Update fn_get_boundaries_for_church to use only place type
 * 
 * Usage: npx tsx scripts/update-boundary-function.ts
 */

import pg from 'pg';

const { Pool } = pg;

async function updateFunction() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

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
        ST_Area(b.geometry) as area
      FROM boundaries b
      WHERE b.type = 'place'
        AND b.geometry IS NOT NULL
        AND ST_Covers(
          b.geometry::geometry,
          ST_SetSRID(ST_MakePoint(church_lon, church_lat), 4326)
        )
      ORDER BY area DESC;
    END;
    $$ LANGUAGE plpgsql;
  `;

  try {
    await pool.query(sql);
    console.log('✅ Function updated to use only place type');
    
    // Test it
    const testResult = await pool.query(
      'SELECT * FROM fn_get_boundaries_for_church(42.9634, -85.6681)'
    );
    console.log('\nTest with Grand Rapids coords (42.9634, -85.6681):');
    console.log(`Found ${testResult.rows.length} boundaries:`);
    testResult.rows.forEach((r: any) => {
      console.log(`  - ${r.type}: ${r.name} (area: ${Math.round(r.area)} sq m)`);
    });
    
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

updateFunction();
