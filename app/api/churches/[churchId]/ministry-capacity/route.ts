import type { Request, Response } from "express";
import { z } from "zod";
import { storage } from "../../../../../server/storage";
import { canEditChurch } from "../../../../../lib/authMiddleware";

const upsertMinistryCapacitySchema = z.object({
  community_ministry_volunteers: z.number().int().min(0),
  annual_ministry_budget: z.number().int().min(0),
});

export async function GET(req: Request, res: Response) {
  try {
    const { churchId } = req.params;

    if (!churchId) {
      return res.status(400).json({ error: "churchId is required" });
    }

    const capacity = await storage.getChurchMinistryCapacity(churchId);

    if (!capacity) {
      return res.json({
        church_id: churchId,
        community_ministry_volunteers: 0,
        annual_ministry_budget: 0,
        ministry_capacity_units: 0,
        created_at: null,
        updated_at: null,
      });
    }

    const ministryCapacityUnits = capacity.community_ministry_volunteers + (capacity.annual_ministry_budget / 1000);

    return res.json({
      ...capacity,
      ministry_capacity_units: Math.round(ministryCapacityUnits * 1000) / 1000,
    });
  } catch (error: any) {
    console.error("[Ministry Capacity GET] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

export async function POST(req: Request, res: Response) {
  try {
    const { churchId } = req.params;

    if (!churchId) {
      return res.status(400).json({ error: "churchId is required" });
    }

    const access = await canEditChurch(req, churchId);
    if (!access.allowed) {
      return res.status(access.authenticationFailed ? 401 : 403).json({
        error: access.authenticationFailed ? "Authentication required" : "Not authorized to edit this church",
      });
    }

    const parsed = upsertMinistryCapacitySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
    }

    const capacity = await storage.upsertChurchMinistryCapacity({
      church_id: churchId,
      community_ministry_volunteers: parsed.data.community_ministry_volunteers,
      annual_ministry_budget: parsed.data.annual_ministry_budget,
    });

    const ministryCapacityUnits = capacity.community_ministry_volunteers + (capacity.annual_ministry_budget / 1000);

    return res.json({
      ...capacity,
      ministry_capacity_units: Math.round(ministryCapacityUnits * 1000) / 1000,
    });
  } catch (error: any) {
    console.error("[Ministry Capacity POST] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}
