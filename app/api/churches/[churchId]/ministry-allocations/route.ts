import type { Request, Response } from "express";
import { z } from "zod";
import { storage } from "../../../../../server/storage";
import { canEditChurch } from "../../../../../lib/authMiddleware";

export async function GET(req: Request, res: Response) {
  try {
    const { churchId } = req.params;

    if (!churchId) {
      return res.status(400).json({ error: "churchId is required" });
    }

    const allocations = await storage.getChurchMinistryAllocations(churchId);
    return res.json({ allocations });
  } catch (error: any) {
    console.error("[Ministry Allocations GET] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

const allocationItemSchema = z.object({
  area_id: z.string().uuid(),
  allocation_pct: z.number().min(0).max(100),
});

const upsertAllocationsSchema = z.object({
  allocations: z.array(allocationItemSchema),
});

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

    const parsed = upsertAllocationsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
    }

    const { allocations } = parsed.data;

    if (allocations.length > 0) {
      const sum = allocations.reduce((acc, a) => acc + a.allocation_pct, 0);
      if (sum < 99 || sum > 101) {
        return res.status(400).json({ error: `Allocation percentages must sum to 100 (got ${sum.toFixed(2)})` });
      }
    }

    await storage.upsertChurchMinistryAllocations(churchId, allocations);

    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Ministry Allocations POST] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}
