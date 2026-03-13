import type { Request, Response } from "express";
import { storage } from "../../../../../server/storage";

export async function GET(req: Request, res: Response) {
  try {
    const { churchId } = req.params;

    if (!churchId) {
      return res.status(400).json({ error: "churchId is required" });
    }

    const allocations = await storage.getChurchPrayerAllocations(churchId);
    return res.json(allocations);
  } catch (error: any) {
    console.error("[Prayer Allocations GET] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

export async function PUT(req: Request, res: Response) {
  try {
    const { churchId } = req.params;

    if (!churchId) {
      return res.status(400).json({ error: "churchId is required" });
    }

    const { allocations } = req.body;

    if (!Array.isArray(allocations)) {
      return res.status(400).json({ error: "allocations must be an array" });
    }

    for (const alloc of allocations) {
      if (!alloc.tract_geoid || typeof alloc.tract_geoid !== "string") {
        return res.status(400).json({ error: "Each allocation must have a valid tract_geoid" });
      }
      if (typeof alloc.allocation_pct !== "number" || alloc.allocation_pct < 0) {
        return res.status(400).json({ error: "Each allocation must have a non-negative allocation_pct" });
      }
    }

    const totalPct = allocations.reduce((sum: number, a: any) => sum + a.allocation_pct, 0);
    if (totalPct > 100) {
      return res.status(400).json({
        error: "Total allocation percentage cannot exceed 100%",
        total: totalPct,
      });
    }

    const existingAllocations = await storage.getChurchPrayerAllocations(churchId);
    const existingMap = new Map(existingAllocations.map(a => [a.tract_geoid, a]));
    const incomingGeoids = new Set(allocations.map((a: any) => a.tract_geoid));

    const results = [];

    for (const alloc of allocations) {
      const result = await storage.upsertChurchPrayerAllocation({
        church_id: churchId,
        tract_geoid: alloc.tract_geoid,
        allocation_pct: alloc.allocation_pct,
      });
      results.push(result);
    }

    for (const [geoid] of existingMap) {
      if (!incomingGeoids.has(geoid)) {
        await storage.deleteChurchPrayerAllocation(churchId, geoid);
      }
    }

    return res.json({
      allocations: results,
      total_pct: totalPct,
    });
  } catch (error: any) {
    console.error("[Prayer Allocations PUT] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}
