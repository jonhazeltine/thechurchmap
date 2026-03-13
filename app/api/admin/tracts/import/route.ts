import type { Request, Response } from "express";
import pg from "pg";
import { fetchTractsForState, fetchTractsForCounty } from "../../../../../server/services/tigerweb";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function fetchPopulationData(stateFips: string, countyFips?: string): Promise<Map<string, number>> {
  const populationMap = new Map<string, number>();

  try {
    let url = `https://api.census.gov/data/2022/acs/acs5?get=B01003_001E&for=tract:*&in=state:${stateFips}`;
    if (countyFips) {
      url += `&in=county:${countyFips}`;
    }

    console.log(`[Tract Import] Fetching population data from: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[Tract Import] Census ACS API error: ${response.status}`);
      return populationMap;
    }

    const data: string[][] = await response.json();
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const population = parseInt(row[0], 10);
      const state = row[1];
      const county = row[2];
      const tract = row[3];
      const geoid = `${state}${county}${tract}`;
      if (!isNaN(population)) {
        populationMap.set(geoid, population);
      }
    }

    console.log(`[Tract Import] Got population data for ${populationMap.size} tracts`);
  } catch (error) {
    console.error("[Tract Import] Error fetching population data:", error);
  }

  return populationMap;
}

export async function POST(req: Request, res: Response) {
  try {
    const { state_fips, county_fips } = req.body;

    if (!state_fips || typeof state_fips !== "string") {
      return res.status(400).json({ error: "state_fips is required" });
    }

    console.log(`[Tract Import] Starting import for state=${state_fips}, county=${county_fips || "all"}`);

    const [tracts, populationMap] = await Promise.all([
      county_fips
        ? fetchTractsForCounty(state_fips, county_fips)
        : fetchTractsForState(state_fips),
      fetchPopulationData(state_fips, county_fips),
    ]);

    if (!tracts || tracts.length === 0) {
      return res.status(404).json({ error: "No tracts found from TIGERweb" });
    }

    console.log(`[Tract Import] Got ${tracts.length} tracts from TIGERweb`);

    let importedCount = 0;
    let errorCount = 0;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const tract of tracts) {
        try {
          const geoid = tract.properties.GEOID;
          const name = tract.properties.NAME;
          const stateFips = tract.properties.STATE;
          const countyFips = tract.properties.COUNTY;
          const population = populationMap.get(geoid) ?? null;
          const geomJson = JSON.stringify(tract.geometry);

          await client.query(
            `INSERT INTO boundaries_tracts (geoid, name, state_fips, county_fips, geom, population)
             VALUES ($1, $2, $3, $4, ST_SetSRID(ST_GeomFromGeoJSON($5), 4326), $6)
             ON CONFLICT (geoid) DO UPDATE SET
               name = EXCLUDED.name,
               state_fips = EXCLUDED.state_fips,
               county_fips = EXCLUDED.county_fips,
               geom = EXCLUDED.geom,
               population = EXCLUDED.population`,
            [geoid, name, stateFips, countyFips, geomJson, population]
          );

          importedCount++;
        } catch (err) {
          errorCount++;
          console.error(`[Tract Import] Error upserting tract:`, err);
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    console.log(`[Tract Import] Complete: ${importedCount} imported, ${errorCount} errors`);

    return res.json({
      success: true,
      imported: importedCount,
      errors: errorCount,
      total_tracts_from_tigerweb: tracts.length,
      population_data_count: populationMap.size,
    });
  } catch (error: any) {
    console.error("[Tract Import] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}
