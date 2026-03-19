import {
  type ChurchPrayerBudget,
  type InsertChurchPrayerBudget,
  type ChurchPrayerAllocation,
  type InsertChurchPrayerAllocation,
} from "@shared/schema";
import pg from "pg";
import { computeEffectiveScore, computeRecoveredScore } from "./engagementScore";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

export interface IStorage {
  getChurchPrayerBudget(churchId: string): Promise<ChurchPrayerBudget | null>;
  upsertChurchPrayerBudget(data: InsertChurchPrayerBudget): Promise<ChurchPrayerBudget>;
  getChurchPrayerAllocations(churchId: string): Promise<ChurchPrayerAllocation[]>;
  upsertChurchPrayerAllocation(data: InsertChurchPrayerAllocation): Promise<ChurchPrayerAllocation>;
  deleteChurchPrayerAllocation(churchId: string, tractGeoid: string): Promise<void>;
  getChurchAllocationTotal(churchId: string): Promise<number>;
  getCityPrayerCoverage(platformId: string): Promise<{ tract_geoid: string; total_allocation_pct: number; church_count: number; population: number }[]>;
  getChurchEngagementScore(churchId: string): Promise<{ church_id: string; base_score: number; last_activity_at: Date; activity_count: number; effective_score: number } | null>;
  recordChurchActivity(churchId: string, activityType: string): Promise<void>;
  getChurchesWithEngagement(churchIds: string[]): Promise<Array<{ church_id: string; effective_score: number }>>;
  getCityPrayerCoverageWithEngagement(platformId: string): Promise<{ tract_geoid: string; total_allocation_pct: number; effective_allocation_pct: number; church_count: number; population: number; avg_engagement_score: number; coverage_pct: number }[]>;
  getTractPopulations(geoids: string[]): Promise<Map<string, number>>;
  upsertTractPopulation(geoid: string, population: number): Promise<void>;
  getChurchIdsWithPrayerBudgets(): Promise<string[]>;
  getChurchMinistryCapacity(churchId: string): Promise<{church_id: string, community_ministry_volunteers: number, annual_ministry_budget: number, created_at: Date, updated_at: Date} | null>;
  upsertChurchMinistryCapacity(data: {church_id: string, community_ministry_volunteers: number, annual_ministry_budget: number}): Promise<{church_id: string, community_ministry_volunteers: number, annual_ministry_budget: number, created_at: Date, updated_at: Date}>;
  getMinistryAreaSaturation(bbox: string, platformId?: string): Promise<Array<{
    tract_geoid: string,
    total_saturation: number,
    church_count: number,
    total_capacity: number,
    population: number
  }>>;
  getMinistryBaselineSaturation(bbox: string): Promise<Array<{
    tract_geoid: string,
    baseline_saturation: number,
    population: number
  }>>;
  getClippedSaturationGeoJSON(bbox: string, platformId?: string): Promise<{
    type: 'FeatureCollection',
    features: Array<{
      type: 'Feature',
      geometry: any,
      properties: {
        tract_geoid: string,
        area_id: string,
        church_id: string,
        saturation: number,
        raw_saturation: number,
        overlap_fraction: number,
        church_count: number,
        population: number,
        has_capacity: boolean,
        area_name: string,
        church_name: string,
        polygon_population: number,
      }
    }>
  }>;
  getChurchMinistryAllocations(churchId: string): Promise<Array<{church_id: string, area_id: string, allocation_pct: number, updated_at: Date}>>;
  upsertChurchMinistryAllocations(churchId: string, allocations: Array<{area_id: string, allocation_pct: number}>): Promise<void>;
  getAreaPopulations(): Promise<{ byAreaId: Map<string, number>; byChurchId: Map<string, number> }>;
  getPlatformAllocationSettings(platformId: string): Promise<{
    platform_id: string,
    people_per_intercessor: number,
    baseline_church_capacity: number,
    volunteer_capacity_weight: number,
    budget_capacity_divisor: number,
  } | null>;
  upsertPlatformAllocationSettings(platformId: string, settings: {
    people_per_intercessor?: number,
    baseline_church_capacity?: number,
    volunteer_capacity_weight?: number,
    budget_capacity_divisor?: number,
  }): Promise<{
    platform_id: string,
    people_per_intercessor: number,
    baseline_church_capacity: number,
    volunteer_capacity_weight: number,
    budget_capacity_divisor: number,
  }>;
}

export class DatabaseStorage implements IStorage {
  async getChurchPrayerBudget(churchId: string): Promise<ChurchPrayerBudget | null> {
    const result = await pool.query(
      `SELECT * FROM church_prayer_budgets WHERE church_id = $1`,
      [churchId]
    );
    return result.rows[0] || null;
  }

  async upsertChurchPrayerBudget(data: InsertChurchPrayerBudget): Promise<ChurchPrayerBudget> {
    const result = await pool.query(
      `INSERT INTO church_prayer_budgets (church_id, daily_intercessor_count, total_budget_pct, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (church_id)
       DO UPDATE SET
         daily_intercessor_count = EXCLUDED.daily_intercessor_count,
         total_budget_pct = EXCLUDED.total_budget_pct,
         updated_at = NOW()
       RETURNING *`,
      [data.church_id, data.daily_intercessor_count ?? 0, data.total_budget_pct ?? 100]
    );
    return result.rows[0];
  }

  async getChurchPrayerAllocations(churchId: string): Promise<ChurchPrayerAllocation[]> {
    const result = await pool.query(
      `SELECT * FROM church_prayer_allocations WHERE church_id = $1 ORDER BY allocation_pct DESC`,
      [churchId]
    );
    return result.rows;
  }

  async upsertChurchPrayerAllocation(data: InsertChurchPrayerAllocation): Promise<ChurchPrayerAllocation> {
    const result = await pool.query(
      `INSERT INTO church_prayer_allocations (church_id, tract_geoid, allocation_pct, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (church_id, tract_geoid)
       DO UPDATE SET
         allocation_pct = EXCLUDED.allocation_pct,
         updated_at = NOW()
       RETURNING *`,
      [data.church_id, data.tract_geoid, data.allocation_pct ?? 0]
    );
    return result.rows[0];
  }

  async deleteChurchPrayerAllocation(churchId: string, tractGeoid: string): Promise<void> {
    await pool.query(
      `DELETE FROM church_prayer_allocations WHERE church_id = $1 AND tract_geoid = $2`,
      [churchId, tractGeoid]
    );
  }

  async getChurchAllocationTotal(churchId: string): Promise<number> {
    const result = await pool.query(
      `SELECT COALESCE(SUM(allocation_pct), 0) as total FROM church_prayer_allocations WHERE church_id = $1`,
      [churchId]
    );
    return parseFloat(result.rows[0].total);
  }

  async getCityPrayerCoverage(platformId: string): Promise<{ tract_geoid: string; total_allocation_pct: number; church_count: number; population: number }[]> {
    const result = await pool.query(
      `SELECT 
         a.tract_geoid,
         SUM(a.allocation_pct) as total_allocation_pct,
         COUNT(DISTINCT a.church_id)::int as church_count,
         COALESCE(t.population, 0)::int as population
       FROM church_prayer_allocations a
       LEFT JOIN boundaries_tracts t ON a.tract_geoid = t.geoid
       GROUP BY a.tract_geoid, t.population
       ORDER BY total_allocation_pct DESC`
    );
    return result.rows.map(r => ({
      tract_geoid: r.tract_geoid,
      total_allocation_pct: parseFloat(r.total_allocation_pct),
      church_count: r.church_count,
      population: r.population,
    }));
  }

  async getChurchEngagementScore(churchId: string): Promise<{ church_id: string; base_score: number; last_activity_at: Date; activity_count: number; effective_score: number } | null> {
    const result = await pool.query(
      `SELECT * FROM church_engagement_scores WHERE church_id = $1`,
      [churchId]
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    const effectiveScore = computeEffectiveScore(row.base_score, new Date(row.last_activity_at));
    return {
      church_id: row.church_id,
      base_score: row.base_score,
      last_activity_at: new Date(row.last_activity_at),
      activity_count: row.activity_count,
      effective_score: Math.round(effectiveScore * 1000) / 1000,
    };
  }

  async recordChurchActivity(churchId: string, activityType: string): Promise<void> {
    const existing = await pool.query(
      `SELECT base_score FROM church_engagement_scores WHERE church_id = $1`,
      [churchId]
    );

    if (existing.rows[0]) {
      const newBaseScore = computeRecoveredScore(existing.rows[0].base_score, activityType);
      await pool.query(
        `UPDATE church_engagement_scores
         SET base_score = $2,
             last_activity_at = NOW(),
             activity_count = activity_count + 1,
             updated_at = NOW()
         WHERE church_id = $1`,
        [churchId, newBaseScore]
      );
    } else {
      const initialScore = computeRecoveredScore(0.5, activityType);
      await pool.query(
        `INSERT INTO church_engagement_scores (church_id, base_score, last_activity_at, activity_count, created_at, updated_at)
         VALUES ($1, $2, NOW(), 1, NOW(), NOW())`,
        [churchId, initialScore]
      );
    }
  }

  async getChurchesWithEngagement(churchIds: string[]): Promise<Array<{ church_id: string; effective_score: number }>> {
    if (churchIds.length === 0) return [];
    const placeholders = churchIds.map((_, i) => `$${i + 1}`).join(',');
    const result = await pool.query(
      `SELECT church_id, base_score, last_activity_at FROM church_engagement_scores WHERE church_id IN (${placeholders})`,
      churchIds
    );
    const scoreMap = new Map<string, { base_score: number; last_activity_at: Date }>();
    for (const row of result.rows) {
      scoreMap.set(row.church_id, { base_score: row.base_score, last_activity_at: new Date(row.last_activity_at) });
    }
    return churchIds.map(id => {
      const data = scoreMap.get(id);
      if (!data) return { church_id: id, effective_score: 1.0 };
      return {
        church_id: id,
        effective_score: Math.round(computeEffectiveScore(data.base_score, data.last_activity_at) * 1000) / 1000,
      };
    });
  }

  async getCityPrayerCoverageWithEngagement(platformId: string): Promise<{ tract_geoid: string; total_allocation_pct: number; effective_allocation_pct: number; church_count: number; population: number; avg_engagement_score: number; coverage_pct: number }[]> {
    const result = await pool.query(
      `SELECT 
         a.tract_geoid,
         SUM(a.allocation_pct) as total_allocation_pct,
         SUM(COALESCE(b.daily_intercessor_count, 0) * a.allocation_pct / 100.0) as total_intercessors,
         COUNT(DISTINCT a.church_id)::int as church_count,
         COALESCE(t.population, 0)::int as population,
         array_agg(DISTINCT a.church_id) as church_ids,
         array_agg(DISTINCT e.base_score) FILTER (WHERE e.base_score IS NOT NULL) as base_scores,
         array_agg(DISTINCT e.last_activity_at) FILTER (WHERE e.last_activity_at IS NOT NULL) as last_activities
       FROM church_prayer_allocations a
       LEFT JOIN boundaries_tracts t ON a.tract_geoid = t.geoid
       LEFT JOIN church_engagement_scores e ON a.church_id = e.church_id
       LEFT JOIN church_prayer_budgets b ON a.church_id = b.church_id
       GROUP BY a.tract_geoid, t.population
       ORDER BY total_allocation_pct DESC`
    );

    const allocParams = await this.getPlatformAllocationParams(platformId);
    const PEOPLE_PER_INTERCESSOR = allocParams.ppi;

    return result.rows.map(r => {
      const totalAlloc = parseFloat(r.total_allocation_pct);
      const totalIntercessors = parseFloat(r.total_intercessors || '0');
      const population = r.population || 0;
      const churchIds: string[] = r.church_ids || [];
      const baseScores: number[] = r.base_scores || [];
      const lastActivities: Date[] = (r.last_activities || []).map((d: any) => new Date(d));

      let avgEngagement = 1.0;
      if (baseScores.length > 0 && lastActivities.length > 0) {
        const scores = baseScores.map((bs, i) => {
          const lastAct = lastActivities[i] || new Date();
          return computeEffectiveScore(bs, lastAct);
        });
        avgEngagement = scores.reduce((a, b) => a + b, 0) / scores.length;
        const churchesWithoutScores = churchIds.length - baseScores.length;
        if (churchesWithoutScores > 0) {
          avgEngagement = (avgEngagement * baseScores.length + churchesWithoutScores * 1.0) / churchIds.length;
        }
      }
      const requiredUnits = population > 0 ? population / PEOPLE_PER_INTERCESSOR : 0;
      const effectiveIntercessors = totalIntercessors * avgEngagement;
      const coveragePct = requiredUnits > 0
        ? Math.round((totalIntercessors / requiredUnits) * 100 * 10) / 10
        : 0;
      const effectiveCoveragePct = requiredUnits > 0
        ? Math.round((effectiveIntercessors / requiredUnits) * 100 * 10) / 10
        : 0;

      return {
        tract_geoid: r.tract_geoid,
        total_allocation_pct: totalAlloc,
        effective_allocation_pct: Math.round(totalAlloc * avgEngagement * 100) / 100,
        church_count: r.church_count,
        population: r.population,
        avg_engagement_score: Math.round(avgEngagement * 1000) / 1000,
        coverage_pct: coveragePct,
        effective_coverage_pct: effectiveCoveragePct,
      };
    });
  }

  async getTractPopulations(geoids: string[]): Promise<Map<string, number>> {
    if (geoids.length === 0) return new Map();
    const placeholders = geoids.map((_, i) => `$${i + 1}`).join(',');
    const result = await pool.query(
      `SELECT geoid, COALESCE(population, 0)::int as population FROM boundaries_tracts WHERE geoid IN (${placeholders})`,
      geoids
    );
    const map = new Map<string, number>();
    for (const row of result.rows) {
      map.set(row.geoid, row.population);
    }
    return map;
  }

  async getChurchIdsWithPrayerBudgets(): Promise<string[]> {
    const result = await pool.query(
      `SELECT DISTINCT b.church_id FROM church_prayer_budgets b
       WHERE b.daily_intercessor_count > 0`
    );
    return result.rows.map(r => r.church_id);
  }

  async getChurchMinistryCapacity(churchId: string): Promise<{church_id: string, community_ministry_volunteers: number, annual_ministry_budget: number, created_at: Date, updated_at: Date} | null> {
    const result = await pool.query(
      `SELECT * FROM church_ministry_capacity WHERE church_id = $1`,
      [churchId]
    );
    return result.rows[0] || null;
  }

  async upsertChurchMinistryCapacity(data: {church_id: string, community_ministry_volunteers: number, annual_ministry_budget: number}): Promise<{church_id: string, community_ministry_volunteers: number, annual_ministry_budget: number, created_at: Date, updated_at: Date}> {
    const result = await pool.query(
      `INSERT INTO church_ministry_capacity (church_id, community_ministry_volunteers, annual_ministry_budget, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (church_id)
       DO UPDATE SET
         community_ministry_volunteers = EXCLUDED.community_ministry_volunteers,
         annual_ministry_budget = EXCLUDED.annual_ministry_budget,
         updated_at = NOW()
       RETURNING *`,
      [data.church_id, data.community_ministry_volunteers ?? 0, data.annual_ministry_budget ?? 0]
    );
    return result.rows[0];
  }

  async getMinistryAreaSaturation(bbox: string, platformId?: string): Promise<Array<{
    tract_geoid: string,
    total_saturation: number,
    church_count: number,
    total_capacity: number,
    population: number
  }>> {
    const [west, south, east, north] = bbox.split(',').map(Number);

    const allocParams = await this.getPlatformAllocationParams(platformId);

    const result = await pool.query(
      `WITH church_capacities AS (
        SELECT DISTINCT o.church_id,
               GREATEST($5, COALESCE(c.community_ministry_volunteers, 0) * $7 + (COALESCE(c.annual_ministry_budget, 0) / $6)) as capacity
        FROM ministry_area_tract_overlaps o
        LEFT JOIN church_ministry_capacity c ON o.church_id = c.church_id
        WHERE o.church_id IS NOT NULL
      ),
      church_area_allocations AS (
        SELECT church_id, area_id, allocation_pct
        FROM church_ministry_allocations
      ),
      church_area_count AS (
        SELECT church_id, COUNT(DISTINCT area_id) as num_areas
        FROM ministry_area_tract_overlaps
        WHERE church_id IS NOT NULL
        GROUP BY church_id
      ),
      area_footprint AS (
        SELECT o.church_id, o.area_id,
               SUM(ST_Area(o.intersection_geom::geography)) as a_area
        FROM ministry_area_tract_overlaps o
        WHERE o.church_id IS NOT NULL
          AND o.overlap_fraction >= 0.02
          AND o.intersection_geom IS NOT NULL
          AND NOT ST_IsEmpty(o.intersection_geom)
        GROUP BY o.church_id, o.area_id
      ),
      tract_capacity AS (
        SELECT o.tract_geoid,
               o.church_id,
               cc.capacity as church_capacity,
               CASE WHEN af.a_area > 0 AND o.population_covered > 0
                 THEN (cc.capacity * COALESCE(caa.allocation_pct, 100.0 / GREATEST(cac.num_areas, 1)) / 100.0)
                      / af.a_area * ST_Area(o.intersection_geom::geography) / o.population_covered
                 ELSE 0
               END as piece_saturation
        FROM ministry_area_tract_overlaps o
        JOIN church_capacities cc ON o.church_id = cc.church_id
        JOIN area_footprint af ON o.church_id = af.church_id AND o.area_id = af.area_id
        LEFT JOIN church_area_allocations caa ON o.church_id = caa.church_id AND o.area_id = caa.area_id::text
        LEFT JOIN church_area_count cac ON o.church_id = cac.church_id
        JOIN boundaries_tracts t ON o.tract_geoid = t.geoid
        WHERE o.church_id IS NOT NULL
          AND o.overlap_fraction >= 0.02
          AND o.intersection_geom IS NOT NULL
          AND NOT ST_IsEmpty(o.intersection_geom)
          AND ST_Intersects(t.geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))
      )
      SELECT
        tc.tract_geoid,
        SUM(tc.piece_saturation) as total_saturation,
        COUNT(DISTINCT tc.church_id)::int as church_count,
        SUM(DISTINCT tc.church_capacity) as total_capacity,
        COALESCE(MAX(t.population), 0)::int as population
      FROM tract_capacity tc
      JOIN boundaries_tracts t ON tc.tract_geoid = t.geoid
      GROUP BY tc.tract_geoid
      ORDER BY total_saturation DESC`,
      [west, south, east, north, allocParams.baseline, allocParams.divisor, allocParams.volWeight]
    );

    return result.rows.map(r => ({
      tract_geoid: r.tract_geoid,
      total_saturation: parseFloat(r.total_saturation) || 0,
      church_count: r.church_count,
      total_capacity: parseFloat(r.total_capacity) || 0,
      population: r.population,
    }));
  }

  async getMinistryBaselineSaturation(bbox: string): Promise<Array<{
    tract_geoid: string,
    baseline_saturation: number,
    population: number
  }>> {
    const [west, south, east, north] = bbox.split(',').map(Number);

    const result = await pool.query(
      `SELECT DISTINCT
         t.geoid as tract_geoid,
         CASE WHEN ST_Area(t.geom::geography) > 0
           THEN COALESCE(t.population, 0) / (ST_Area(t.geom::geography) / 1000000.0)
           ELSE 0
         END as baseline_saturation,
         COALESCE(t.population, 0)::int as population
       FROM boundaries_tracts t
       JOIN ministry_area_tract_overlaps o ON t.geoid = o.tract_geoid
       WHERE ST_Intersects(t.geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))
       ORDER BY baseline_saturation DESC`,
      [west, south, east, north]
    );

    return result.rows.map(r => ({
      tract_geoid: r.tract_geoid,
      baseline_saturation: parseFloat(r.baseline_saturation) || 0,
      population: r.population,
    }));
  }

  async getClippedSaturationGeoJSON(bbox: string, platformId?: string): Promise<{
    type: 'FeatureCollection',
    features: Array<{
      type: 'Feature',
      geometry: any,
      properties: {
        tract_geoid: string,
        area_id: string,
        church_id: string,
        saturation: number,
        raw_saturation: number,
        overlap_fraction: number,
        church_count: number,
        population: number,
        has_capacity: boolean,
        area_name: string,
        church_name: string,
        polygon_population: number,
      }
    }>
  }> {
    const [west, south, east, north] = bbox.split(',').map(Number);

    let platformChurchIds: Set<string> | null = null;
    if (platformId) {
      try {
        const { supabaseServer } = await import("../lib/supabaseServer");
        const supabase = supabaseServer();
        const { data: platformChurches } = await supabase
          .from("city_platform_churches")
          .select("church_id")
          .eq("city_platform_id", platformId)
          .in("status", ["visible", "featured"]);
        platformChurchIds = new Set((platformChurches || []).map((pc: any) => pc.church_id));
      } catch (e) {
        console.error("Failed to fetch platform churches for saturation:", e);
      }
    }

    const platformChurchArray = platformChurchIds && platformChurchIds.size > 0 ? [...platformChurchIds] : (platformId ? ['__none__'] : null);

    const allocParams = await this.getPlatformAllocationParams(platformId);

    const result = await pool.query(
      `WITH church_capacities AS (
        SELECT DISTINCT o.church_id,
               GREATEST($6, COALESCE(c.community_ministry_volunteers, 0) * $8 + (COALESCE(c.annual_ministry_budget, 0) / $7)) as capacity
        FROM ministry_area_tract_overlaps o
        LEFT JOIN church_ministry_capacity c ON o.church_id = c.church_id
        WHERE o.church_id IS NOT NULL
          AND ($5::text[] IS NULL OR o.church_id::text = ANY($5::text[]))
      ),
      church_area_allocations AS (
        SELECT church_id, area_id, allocation_pct
        FROM church_ministry_allocations
      ),
      church_area_count AS (
        SELECT church_id, COUNT(DISTINCT area_id) as num_areas
        FROM ministry_area_tract_overlaps
        WHERE church_id IS NOT NULL
          AND ($5::text[] IS NULL OR church_id::text = ANY($5::text[]))
        GROUP BY church_id
      ),
      church_polygon_pop AS (
        SELECT church_id, SUM(population_covered)::int as polygon_population
        FROM ministry_area_tract_overlaps
        WHERE church_id IS NOT NULL
          AND ($5::text[] IS NULL OR church_id::text = ANY($5::text[]))
          AND overlap_fraction >= 0.02
        GROUP BY church_id
      ),
      area_footprint AS (
        SELECT church_id, area_id,
               SUM(a_piece) as a_area
        FROM (
          SELECT o.church_id,
                 o.area_id,
                 o.tract_geoid,
                 ST_Area(o.intersection_geom::geography) as a_piece,
                 ROW_NUMBER() OVER (PARTITION BY o.church_id, o.area_id, o.tract_geoid ORDER BY o.overlap_fraction DESC) as rn
          FROM ministry_area_tract_overlaps o
          WHERE o.church_id IS NOT NULL
            AND ($5::text[] IS NULL OR o.church_id::text = ANY($5::text[]))
            AND o.overlap_fraction >= 0.02
            AND o.intersection_geom IS NOT NULL
            AND NOT ST_IsEmpty(o.intersection_geom)
        ) deduped
        WHERE rn = 1
        GROUP BY church_id, area_id
      ),
      tract_level_raw AS (
        SELECT o.tract_geoid,
               o.area_id,
               o.overlap_fraction,
               o.intersection_geom,
               o.church_id,
               o.population_covered,
               ST_Area(o.intersection_geom::geography) as a_piece,
               cc.capacity as church_capacity,
               COALESCE(t.population, 0) as population,
               CASE WHEN af.a_area > 0 AND o.population_covered > 0
                 THEN (cc.capacity * COALESCE(caa.allocation_pct, 100.0 / GREATEST(cac.num_areas, 1)) / 100.0)
                      / af.a_area * ST_Area(o.intersection_geom::geography) / o.population_covered
                 ELSE 0
               END as piece_saturation,
               ROW_NUMBER() OVER (PARTITION BY o.church_id, o.area_id, o.tract_geoid ORDER BY o.overlap_fraction DESC) as rn
        FROM ministry_area_tract_overlaps o
        JOIN church_capacities cc ON o.church_id = cc.church_id
        JOIN area_footprint af ON o.church_id = af.church_id AND o.area_id = af.area_id
        LEFT JOIN church_area_allocations caa ON o.church_id = caa.church_id AND o.area_id = caa.area_id::text
        LEFT JOIN church_area_count cac ON o.church_id = cac.church_id
        JOIN boundaries_tracts t ON o.tract_geoid = t.geoid
        WHERE o.church_id IS NOT NULL
          AND o.overlap_fraction >= 0.02
          AND o.intersection_geom IS NOT NULL
          AND NOT ST_IsEmpty(o.intersection_geom)
          AND GeometryType(o.intersection_geom) IN ('POLYGON', 'MULTIPOLYGON')
          AND ST_Intersects(t.geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))
      ),
      tract_level AS (
        SELECT tract_geoid, area_id, overlap_fraction, intersection_geom, church_id,
               population_covered, a_piece, church_capacity, population, piece_saturation
        FROM tract_level_raw
        WHERE rn = 1
      ),
      tract_totals AS (
        SELECT
          tract_geoid,
          SUM(piece_saturation) as tract_raw_saturation,
          COUNT(DISTINCT church_id)::int as tract_church_count
        FROM tract_level
        GROUP BY tract_geoid
      )
      SELECT
        tl.tract_geoid,
        tl.area_id,
        ST_AsGeoJSON(tl.intersection_geom)::json as geojson,
        tl.overlap_fraction,
        tl.piece_saturation as piece_raw_saturation,
        tt.tract_raw_saturation as raw_saturation,
        tt.tract_church_count as church_count,
        tl.population::int as population,
        tl.population_covered::int as piece_population,
        tl.a_piece as piece_area_sqm,
        tl.church_capacity > $6 as has_capacity,
        tl.church_id::text as church_id_val,
        COALESCE(cpp.polygon_population, 0)::int as polygon_population
      FROM tract_level tl
      JOIN tract_totals tt ON tl.tract_geoid = tt.tract_geoid
      LEFT JOIN church_polygon_pop cpp ON tl.church_id = cpp.church_id
      ORDER BY tt.tract_raw_saturation DESC`,
      [west, south, east, north, platformChurchArray, allocParams.baseline, allocParams.divisor, allocParams.volWeight]
    );

    const rows = result.rows;

    const churchIds = [...new Set(rows.map(r => r.church_id_val).filter(Boolean))];
    const churchNameMap = new Map<string, string>();
    if (churchIds.length > 0) {
      try {
        const { supabaseServer } = await import("../lib/supabaseServer");
        const supabase = supabaseServer();
        const { data: churches } = await supabase
          .from("churches")
          .select("id, name")
          .in("id", churchIds);
        (churches || []).forEach((c: any) => churchNameMap.set(c.id, c.name));
      } catch (e) {
        console.error("Failed to fetch church names for saturation:", e);
      }
    }

    const coveredTractGeoids = new Set(rows.map(r => r.tract_geoid));

    const uncoveredResult = await pool.query(
      `SELECT t.geoid as tract_geoid,
              ST_AsGeoJSON(t.geom)::json as geojson,
              COALESCE(t.population, 0)::int as population
       FROM boundaries_tracts t
       WHERE ST_Intersects(t.geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))`,
      [west, south, east, north]
    );

    const features = rows.map(r => {
      const pieceRawSat = parseFloat(r.piece_raw_saturation) || 0;
      const tractRawSat = parseFloat(r.raw_saturation) || 0;
      const churchId = r.church_id_val || '';
      const churchName = churchNameMap.get(churchId) || '';
      const pieceAreaSqm = parseFloat(r.piece_area_sqm) || 0;
      const piecePopulation = r.piece_population || 0;
      const pieceAreaSqMi = pieceAreaSqm / 2589988.11;
      const popDensity = pieceAreaSqMi > 0 ? Math.round(piecePopulation / pieceAreaSqMi) : 0;
      return {
        type: 'Feature' as const,
        geometry: r.geojson,
        properties: {
          tract_geoid: r.tract_geoid,
          area_id: r.area_id,
          church_id: churchId,
          saturation: pieceRawSat * 1500,
          raw_saturation: tractRawSat,
          overlap_fraction: parseFloat(r.overlap_fraction) || 0,
          church_count: r.church_count,
          population: r.population,
          piece_population: piecePopulation,
          pop_density: popDensity,
          has_capacity: r.has_capacity === true,
          area_name: churchName || '',
          church_name: churchName,
          polygon_population: r.polygon_population || 0,
        },
      };
    });

    uncoveredResult.rows.forEach(r => {
      if (!coveredTractGeoids.has(r.tract_geoid)) {
        features.push({
          type: 'Feature' as const,
          geometry: r.geojson,
          properties: {
            tract_geoid: r.tract_geoid,
            area_id: '',
            church_id: '',
            saturation: 0,
            raw_saturation: 0,
            overlap_fraction: 0,
            church_count: 0,
            population: r.population,
            has_capacity: false,
            area_name: '',
            church_name: '',
            polygon_population: 0,
          },
        });
      }
    });

    return { type: 'FeatureCollection', features };
  }

  async getChurchMinistryAllocations(churchId: string): Promise<Array<{church_id: string, area_id: string, allocation_pct: number, updated_at: Date}>> {
    const result = await pool.query(
      `SELECT church_id, area_id, allocation_pct, updated_at FROM church_ministry_allocations WHERE church_id = $1`,
      [churchId]
    );
    return result.rows.map(r => ({
      church_id: r.church_id,
      area_id: r.area_id,
      allocation_pct: parseFloat(r.allocation_pct),
      updated_at: new Date(r.updated_at),
    }));
  }

  async upsertChurchMinistryAllocations(churchId: string, allocations: Array<{area_id: string, allocation_pct: number}>): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM church_ministry_allocations WHERE church_id = $1', [churchId]);
      for (const alloc of allocations) {
        await client.query(
          `INSERT INTO church_ministry_allocations (church_id, area_id, allocation_pct, updated_at) VALUES ($1, $2, $3, NOW())`,
          [churchId, alloc.area_id, alloc.allocation_pct]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getAreaPopulations(): Promise<{ byAreaId: Map<string, number>; byChurchId: Map<string, number> }> {
    const result = await pool.query(
      `SELECT area_id, church_id, SUM(population_covered)::int as total_population
       FROM ministry_area_tract_overlaps
       WHERE population_covered > 0
       GROUP BY area_id, church_id`
    );
    const byAreaId = new Map<string, number>();
    const byChurchId = new Map<string, number>();
    for (const row of result.rows) {
      byAreaId.set(row.area_id, (byAreaId.get(row.area_id) || 0) + row.total_population);
      if (row.church_id) {
        byChurchId.set(row.church_id, (byChurchId.get(row.church_id) || 0) + row.total_population);
      }
    }
    return { byAreaId, byChurchId };
  }

  async upsertTractPopulation(geoid: string, population: number): Promise<void> {
    const stateFips = geoid.substring(0, 2);
    const countyFips = geoid.substring(2, 5);
    const tractName = geoid.substring(5);
    await pool.query(
      `INSERT INTO boundaries_tracts (geoid, name, state_fips, county_fips, population)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (geoid) DO UPDATE SET population = EXCLUDED.population`,
      [geoid, tractName, stateFips, countyFips, population]
    );
  }

  async getPlatformAllocationSettings(platformId: string): Promise<{
    platform_id: string,
    people_per_intercessor: number,
    baseline_church_capacity: number,
    volunteer_capacity_weight: number,
    budget_capacity_divisor: number,
  } | null> {
    const result = await pool.query(
      `SELECT * FROM platform_allocation_settings WHERE platform_id = $1`,
      [platformId]
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      platform_id: row.platform_id,
      people_per_intercessor: row.people_per_intercessor,
      baseline_church_capacity: parseFloat(row.baseline_church_capacity),
      volunteer_capacity_weight: parseFloat(row.volunteer_capacity_weight),
      budget_capacity_divisor: parseFloat(row.budget_capacity_divisor),
    };
  }

  async upsertPlatformAllocationSettings(platformId: string, settings: {
    people_per_intercessor?: number,
    baseline_church_capacity?: number,
    volunteer_capacity_weight?: number,
    budget_capacity_divisor?: number,
  }): Promise<{
    platform_id: string,
    people_per_intercessor: number,
    baseline_church_capacity: number,
    volunteer_capacity_weight: number,
    budget_capacity_divisor: number,
  }> {
    const result = await pool.query(
      `INSERT INTO platform_allocation_settings (platform_id, people_per_intercessor, baseline_church_capacity, volunteer_capacity_weight, budget_capacity_divisor, created_at, updated_at)
       VALUES ($1, COALESCE($2, 200), COALESCE($3, 1.0), COALESCE($4, 1.0), COALESCE($5, 1000.0), NOW(), NOW())
       ON CONFLICT (platform_id)
       DO UPDATE SET
         people_per_intercessor = COALESCE($2, platform_allocation_settings.people_per_intercessor),
         baseline_church_capacity = COALESCE($3, platform_allocation_settings.baseline_church_capacity),
         volunteer_capacity_weight = COALESCE($4, platform_allocation_settings.volunteer_capacity_weight),
         budget_capacity_divisor = COALESCE($5, platform_allocation_settings.budget_capacity_divisor),
         updated_at = NOW()
       RETURNING *`,
      [platformId, settings.people_per_intercessor ?? null, settings.baseline_church_capacity ?? null, settings.volunteer_capacity_weight ?? null, settings.budget_capacity_divisor ?? null]
    );
    const row = result.rows[0];
    return {
      platform_id: row.platform_id,
      people_per_intercessor: row.people_per_intercessor,
      baseline_church_capacity: parseFloat(row.baseline_church_capacity),
      volunteer_capacity_weight: parseFloat(row.volunteer_capacity_weight),
      budget_capacity_divisor: parseFloat(row.budget_capacity_divisor),
    };
  }

  async getPlatformAllocationParams(platformId?: string): Promise<{ baseline: number, divisor: number, volWeight: number, ppi: number }> {
    const defaults = { baseline: 1.0, divisor: 1000.0, volWeight: 1.0, ppi: 200 };
    if (!platformId) return defaults;
    const settings = await this.getPlatformAllocationSettings(platformId);
    if (!settings) return defaults;
    return {
      baseline: settings.baseline_church_capacity,
      divisor: settings.budget_capacity_divisor,
      volWeight: settings.volunteer_capacity_weight,
      ppi: settings.people_per_intercessor,
    };
  }
}

export const storage = new DatabaseStorage();
