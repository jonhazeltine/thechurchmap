import type { Request, Response } from "express";
import { storage } from "../../../../../server/storage";

export async function GET(req: Request, res: Response) {
  try {
    const { churchId } = req.params;

    if (!churchId) {
      return res.status(400).json({ error: "churchId is required" });
    }

    const [budget, allocations, totalPct] = await Promise.all([
      storage.getChurchPrayerBudget(churchId),
      storage.getChurchPrayerAllocations(churchId),
      storage.getChurchAllocationTotal(churchId),
    ]);

    const tractGeoids = allocations.map(a => a.tract_geoid);
    const tractPopulations = tractGeoids.length > 0
      ? await storage.getTractPopulations(tractGeoids)
      : new Map<string, number>();

    const dailyIntercessors = budget?.daily_intercessor_count ?? 0;

    const PEOPLE_PER_INTERCESSOR = 200;
    const enrichedAllocations = allocations.map(a => {
      const pop = tractPopulations.get(a.tract_geoid) ?? 0;
      const intercessorsForTract = dailyIntercessors * (a.allocation_pct / 100);
      const requiredUnits = pop > 0 ? pop / PEOPLE_PER_INTERCESSOR : 0;
      const coveragePct = requiredUnits > 0
        ? Math.round((intercessorsForTract / requiredUnits) * 100 * 10) / 10
        : 0;
      return { ...a, population: pop, coverage_pct: coveragePct };
    });

    return res.json({
      budget: budget || {
        church_id: churchId,
        daily_intercessor_count: 0,
        total_budget_pct: 100,
        created_at: null,
        updated_at: null,
      },
      allocations: enrichedAllocations,
      total_allocation_pct: totalPct,
      remaining_pct: 100 - totalPct,
    });
  } catch (error: any) {
    console.error("[Prayer Coverage Church GET] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}
