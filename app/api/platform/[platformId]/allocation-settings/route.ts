import type { Request, Response } from "express";
import { storage } from "../../../../../server/storage";

export async function GET(req: Request, res: Response) {
  try {
    const { platformId } = req.params;

    if (!platformId) {
      return res.status(400).json({ error: "platformId is required" });
    }

    const settings = await storage.getPlatformAllocationSettings(platformId);

    if (!settings) {
      return res.json({
        platform_id: platformId,
        people_per_intercessor: 200,
        baseline_church_capacity: 1.0,
        volunteer_capacity_weight: 1.0,
        budget_capacity_divisor: 1000.0,
      });
    }

    return res.json(settings);
  } catch (error: any) {
    console.error("[Platform Allocation Settings GET] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

export async function PATCH(req: Request, res: Response) {
  try {
    const { platformId } = req.params;

    if (!platformId) {
      return res.status(400).json({ error: "platformId is required" });
    }

    const { people_per_intercessor, baseline_church_capacity, volunteer_capacity_weight, budget_capacity_divisor } = req.body;

    const updated = await storage.upsertPlatformAllocationSettings(platformId, {
      people_per_intercessor,
      baseline_church_capacity,
      volunteer_capacity_weight,
      budget_capacity_divisor,
    });

    return res.json(updated);
  } catch (error: any) {
    console.error("[Platform Allocation Settings PATCH] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}
