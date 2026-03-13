import pg from 'pg';

const { Pool } = pg;

async function debug() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Count by type
    console.log('=== Boundary counts by type ===');
    const counts = await pool.query(`
      SELECT type, COUNT(*) as count,
             COUNT(geometry) as with_geometry
      FROM boundaries 
      GROUP BY type
    `);
    counts.rows.forEach((r: any) => {
      console.log(`  ${r.type}: ${r.count} total, ${r.with_geometry} with geometry`);
    });

    // Check if geometry column has actual data
    console.log('\n=== Sample geometry check ===');
    const sample = await pool.query(`
      SELECT id, name, type,
             geometry IS NOT NULL as has_geom,
             ST_IsEmpty(geometry::geometry) as is_empty,
             ST_SRID(geometry::geometry) as srid
      FROM boundaries 
      WHERE type = 'place'
      LIMIT 5
    `);
    sample.rows.forEach((r: any) => {
      console.log(`  ${r.name}: has_geom=${r.has_geom}, is_empty=${r.is_empty}, srid=${r.srid}`);
    });

    // Try a simpler spatial query
    console.log('\n=== Simple bounding box test ===');
    const bbox = await pool.query(`
      SELECT id, name, type
      FROM boundaries 
      WHERE type IN ('place', 'county subdivision')
        AND geometry && ST_MakeEnvelope(-86, 42.5, -85, 43.5, 4326)
      LIMIT 10
    `);
    console.log(`Boundaries in Kent County area: ${bbox.rows.length}`);
    bbox.rows.forEach((r: any) => console.log(`  ${r.type}: ${r.name}`));

  } finally {
    await pool.end();
  }
}

debug();
