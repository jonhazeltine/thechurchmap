import type { Request, Response } from "express";
import { storage } from "../../../../../server/storage";
import { insertChurchPrayerBudgetSchema } from "../../../../../shared/schema";


export async function GET(req: Request, res: Response) {
  try {
    const { churchId } = req.params;

    if (!churchId) {
      return res.status(400).json({ error: "churchId is required" });
    }

    const budget = await storage.getChurchPrayerBudget(churchId);

    if (!budget) {
      return res.json({
        church_id: churchId,
        daily_intercessor_count: 0,
        total_budget_pct: 100,
        created_at: null,
        updated_at: null,
      });
    }

    return res.json(budget);
  } catch (error: any) {
    console.error("[Prayer Budget GET] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

export async function POST(req: Request, res: Response) {
  try {
    const { churchId } = req.params;

    if (!churchId) {
      return res.status(400).json({ error: "churchId is required" });
    }

    const parsed = insertChurchPrayerBudgetSchema.safeParse({
      ...req.body,
      church_id: churchId,
    });

    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid data", details: parsed.error.flatten() });
    }

    if (parsed.data.daily_intercessor_count !== undefined && parsed.data.daily_intercessor_count < 0) {
      return res.status(400).json({ error: "daily_intercessor_count must be >= 0" });
    }

    const oldBudget = await storage.getChurchPrayerBudget(churchId);
    const oldCount = oldBudget?.daily_intercessor_count ?? 0;
    const newCount = parsed.data.daily_intercessor_count ?? 0;

    const budget = await storage.upsertChurchPrayerBudget(parsed.data);

    let allocationAdjustment: { adjusted: boolean; scaled_down: boolean; old_total_pct: number; new_total_pct: number } = {
      adjusted: false, scaled_down: false, old_total_pct: 0, new_total_pct: 0,
    };

    if (oldCount > 0 && newCount > 0 && oldCount !== newCount) {
      try {
        const allocations = await storage.getChurchPrayerAllocations(churchId);
        if (allocations.length > 0) {
          const ratio = oldCount / newCount;
          let newAllocations = allocations.map(a => ({
            ...a,
            allocation_pct: Math.round((a.allocation_pct * ratio) * 100) / 100,
          }));

          const newTotal = newAllocations.reduce((sum, a) => sum + a.allocation_pct, 0);
          const oldTotal = allocations.reduce((sum, a) => sum + a.allocation_pct, 0);
          let scaledDown = false;

          if (newTotal > 100) {
            const scaleFactor = 100 / newTotal;
            newAllocations = newAllocations.map(a => ({
              ...a,
              allocation_pct: Math.round((a.allocation_pct * scaleFactor) * 100) / 100,
            }));
            scaledDown = true;
          }

          for (const alloc of newAllocations) {
            if (alloc.allocation_pct > 0) {
              await storage.upsertChurchPrayerAllocation({
                church_id: churchId,
                tract_geoid: alloc.tract_geoid,
                allocation_pct: alloc.allocation_pct,
              });
            } else {
              await storage.deleteChurchPrayerAllocation(churchId, alloc.tract_geoid);
            }
          }

          const finalTotal = newAllocations.filter(a => a.allocation_pct > 0).reduce((sum, a) => sum + a.allocation_pct, 0);
          allocationAdjustment = {
            adjusted: true,
            scaled_down: scaledDown,
            old_total_pct: Math.round(oldTotal * 100) / 100,
            new_total_pct: Math.round(finalTotal * 100) / 100,
          };
        }
      } catch (allocError) {
        console.error('Non-critical: failed to adjust allocations:', allocError);
      }
    }

    try {
      await storage.recordChurchActivity(churchId, 'budget_updated');
    } catch (engagementError) {
      console.error('Non-critical: failed to record engagement activity:', engagementError);
    }

    return res.json({ ...budget, allocation_adjustment: allocationAdjustment });
  } catch (error: any) {
    console.error("[Prayer Budget POST] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}
