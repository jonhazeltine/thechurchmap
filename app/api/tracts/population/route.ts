import type { Request, Response } from "express";
import { storage } from "../../../../server/storage";
import { fetchTractPopulation } from "../../../../server/services/census-acs";

export async function GET(req: Request, res: Response) {
  try {
    const { geoid } = req.query;

    if (!geoid || typeof geoid !== "string") {
      return res.status(400).json({ error: "geoid query parameter is required" });
    }

    const populations = await storage.getTractPopulations([geoid]);
    let population = populations.get(geoid) ?? 0;

    if (!population) {
      const censusPopulation = await fetchTractPopulation(geoid);
      if (censusPopulation !== null) {
        population = censusPopulation;
        await storage.upsertTractPopulation(geoid, censusPopulation);
      }
    }

    return res.json({ geoid, population });
  } catch (error: any) {
    console.error("[Tract Population] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}
