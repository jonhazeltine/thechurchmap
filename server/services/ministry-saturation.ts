import pg from "pg";

const dbUrl = process.env.DATABASE_URL;
const isLocal = !!(dbUrl && (dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1")));
const dbUser = process.env.SUPABASE_DB_USER || '';
const dbHost = process.env.SUPABASE_DB_HOST || '';
console.log(`[pg-pool] isLocal=${isLocal}, DATABASE_URL=${dbUrl ? 'set' : 'unset'}, SUPABASE_DB_USER=${dbUser ? dbUser.substring(0,10) + '...' : 'unset'}, SUPABASE_DB_HOST=${dbHost || 'unset'}`);
const pool = new pg.Pool(
  isLocal
    ? { connectionString: dbUrl, ssl: false }
    : {
        host: dbHost || 'aws-0-us-west-2.pooler.supabase.com',
        port: parseInt(process.env.SUPABASE_DB_PORT || '5432'),
        database: 'postgres',
        user: dbUser,
        password: process.env.SUPABASE_DB_PASSWORD || '',
        ssl: { rejectUnauthorized: false },
      },
});

const MIN_OVERLAP_FRACTION = 0.02;

export async function computeAreaTractOverlaps(areaId: string, geometryGeoJSON: object, churchId?: string): Promise<void> {
  const client = await pool.connect();
  try {
    const geojsonStr = JSON.stringify(geometryGeoJSON);
    await client.query('BEGIN');

    await client.query(
      'DELETE FROM ministry_area_tract_overlaps WHERE area_id = $1',
      [areaId]
    );

    await client.query(
      `INSERT INTO ministry_area_tract_overlaps (area_id, tract_geoid, overlap_fraction, population_covered, computed_at, church_id, intersection_geom)
       SELECT
         $2 AS area_id,
         t.geoid AS tract_geoid,
         ovlp.frac AS overlap_fraction,
         ROUND(COALESCE(t.population, 0) * ovlp.frac)::integer AS population_covered,
         NOW() AS computed_at,
         $3::uuid AS church_id,
         ST_MakeValid(ST_Intersection(t.geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))) AS intersection_geom
       FROM boundaries_tracts t,
         LATERAL (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography AS geog) poly,
         LATERAL (SELECT ST_Area(ST_Intersection(t.geom::geography, poly.geog)) / NULLIF(ST_Area(t.geom::geography), 0) AS frac) ovlp
       WHERE ST_Intersects(t.geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))
         AND ST_Area(t.geom::geography) > 0
         AND ovlp.frac >= $4`,
      [geojsonStr, areaId, churchId || null, MIN_OVERLAP_FRACTION]
    );

    if (churchId) {
      await recomputeChurchEffectivePop(client, churchId);
    }

    await client.query('COMMIT');
    console.log(`[ministry-saturation] Computed overlaps for area ${areaId} (church: ${churchId || 'none'})`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[ministry-saturation] Error computing overlaps for area ${areaId}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

async function recomputeChurchEffectivePop(client: pg.PoolClient, churchId: string): Promise<void> {
  const result = await client.query(
    `SELECT COALESCE(SUM(max_pop), 0)::integer AS effective_pop
     FROM (
       SELECT tract_geoid, MAX(population_covered) AS max_pop
       FROM ministry_area_tract_overlaps
       WHERE church_id = $1
         AND overlap_fraction >= $2
       GROUP BY tract_geoid
     ) sub`,
    [churchId, MIN_OVERLAP_FRACTION]
  );
  const effectivePop = parseInt(result.rows[0]?.effective_pop || '0', 10);

  await client.query(
    `INSERT INTO church_ministry_capacity (church_id, effective_pop)
     VALUES ($1, $2)
     ON CONFLICT (church_id) DO UPDATE SET effective_pop = $2, updated_at = NOW()`,
    [churchId, effectivePop]
  );
  console.log(`[ministry-saturation] Church ${churchId} effective_pop = ${effectivePop}`);
}

export async function invalidateAreaOverlaps(areaId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const churchResult = await client.query(
      'SELECT DISTINCT church_id FROM ministry_area_tract_overlaps WHERE area_id = $1 AND church_id IS NOT NULL',
      [areaId]
    );
    const churchIds = churchResult.rows.map(r => r.church_id);

    await client.query(
      'DELETE FROM ministry_area_tract_overlaps WHERE area_id = $1',
      [areaId]
    );

    for (const cid of churchIds) {
      await recomputeChurchEffectivePop(client, cid);
    }

    await client.query('COMMIT');
    console.log(`[ministry-saturation] Invalidated overlaps for area ${areaId}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[ministry-saturation] Error invalidating overlaps for area ${areaId}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

export async function getAreaOverlaps(areaId: string): Promise<Array<{ tract_geoid: string; overlap_fraction: number; population_covered: number }>> {
  const result = await pool.query(
    `SELECT tract_geoid, overlap_fraction, population_covered
     FROM ministry_area_tract_overlaps
     WHERE area_id = $1
       AND overlap_fraction >= $2
     ORDER BY overlap_fraction DESC`,
    [areaId, MIN_OVERLAP_FRACTION]
  );
  return result.rows.map(r => ({
    tract_geoid: r.tract_geoid,
    overlap_fraction: parseFloat(r.overlap_fraction),
    population_covered: parseInt(r.population_covered, 10),
  }));
}

export async function getChurchTotalPopulation(churchId: string, areaIds: string[]): Promise<number> {
  if (areaIds.length === 0) return 0;

  const placeholders = areaIds.map((_, i) => `$${i + 1}`).join(',');
  const result = await pool.query(
    `SELECT COALESCE(SUM(max_pop), 0)::integer AS total_population
     FROM (
       SELECT tract_geoid, MAX(population_covered) AS max_pop
       FROM ministry_area_tract_overlaps
       WHERE area_id IN (${placeholders})
         AND overlap_fraction >= ${MIN_OVERLAP_FRACTION}
       GROUP BY tract_geoid
     ) sub`,
    areaIds
  );
  return parseInt(result.rows[0]?.total_population || '0', 10);
}

export async function cleanupOrphanedOverlaps(): Promise<{ cleaned: string[]; kept: string[] }> {
  const client = await pool.connect();
  try {
    const churchResult = await client.query(
      'SELECT DISTINCT church_id FROM ministry_area_tract_overlaps WHERE church_id IS NOT NULL'
    );
    const churchIds: string[] = churchResult.rows.map((r: any) => r.church_id);

    const { supabaseServer } = await import("../../lib/supabaseServer");
    const supabase = supabaseServer();

    const cleaned: string[] = [];
    const kept: string[] = [];

    for (const churchId of churchIds) {
      const { data: areas } = await supabase
        .from('areas')
        .select('id')
        .eq('church_id', churchId)
        .limit(1);

      const { data: primaryArea } = await supabase
        .from('primary_ministry_areas')
        .select('church_id')
        .eq('church_id', churchId)
        .limit(1);

      const hasAreas = areas && areas.length > 0;
      const hasPrimary = primaryArea && primaryArea.length > 0;

      if (!hasAreas && !hasPrimary) {
        await client.query('BEGIN');
        await client.query(
          'DELETE FROM ministry_area_tract_overlaps WHERE church_id = $1',
          [churchId]
        );
        await client.query(
          `INSERT INTO church_ministry_capacity (church_id, effective_pop)
           VALUES ($1, 0)
           ON CONFLICT (church_id) DO UPDATE SET effective_pop = 0, updated_at = NOW()`,
          [churchId]
        );
        await client.query('COMMIT');
        cleaned.push(churchId);
        console.log(`[ministry-saturation] Cleaned orphaned overlaps for church ${churchId}`);
      } else {
        kept.push(churchId);
      }
    }

    console.log(`[ministry-saturation] Orphan cleanup: cleaned ${cleaned.length}, kept ${kept.length}`);
    return { cleaned, kept };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[ministry-saturation] Error cleaning orphaned overlaps:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function backfillAllEffectivePop(): Promise<void> {
  const client = await pool.connect();
  try {
    const churchResult = await client.query(
      'SELECT DISTINCT church_id FROM ministry_area_tract_overlaps WHERE church_id IS NOT NULL'
    );
    await client.query('BEGIN');
    for (const row of churchResult.rows) {
      await recomputeChurchEffectivePop(client, row.church_id);
    }
    await client.query('COMMIT');
    console.log(`[ministry-saturation] Backfilled effective_pop for ${churchResult.rows.length} churches`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[ministry-saturation] Error backfilling effective_pop:', error);
    throw error;
  } finally {
    client.release();
  }
}
