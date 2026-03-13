import type { Request, Response } from "express";
import { storage } from "../../../../server/storage";

export async function GET(req: Request, res: Response) {
  try {
    const { city_platform_id } = req.query;

    if (!city_platform_id || typeof city_platform_id !== "string") {
      return res.status(400).json({ error: "city_platform_id query parameter is required" });
    }

    const coverage = await storage.getCityPrayerCoverageWithEngagement(city_platform_id);

    const totalPopulation = coverage.reduce((sum, c) => sum + c.population, 0);
    const coveredTracts = coverage.filter(c => c.total_allocation_pct > 0).length;

    return res.json({
      tracts: coverage,
      summary: {
        total_tracts: coverage.length,
        covered_tracts: coveredTracts,
        total_population: totalPopulation,
      },
    });
  } catch (error: any) {
    console.error("[Prayer Coverage City GET] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}
