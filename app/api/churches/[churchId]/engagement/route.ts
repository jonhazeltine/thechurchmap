import type { Request, Response } from "express";
import { storage } from "../../../../../server/storage";

export async function GET(req: Request, res: Response) {
  try {
    const { churchId } = req.params;

    if (!churchId) {
      return res.status(400).json({ error: "churchId is required" });
    }

    const engagement = await storage.getChurchEngagementScore(churchId);

    if (!engagement) {
      return res.json({
        church_id: churchId,
        base_score: 1.0,
        last_activity_at: null,
        activity_count: 0,
        effective_score: 1.0,
      });
    }

    return res.json(engagement);
  } catch (error: any) {
    console.error("[Church Engagement GET] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}

export async function POST(req: Request, res: Response) {
  try {
    const { churchId } = req.params;

    if (!churchId) {
      return res.status(400).json({ error: "churchId is required" });
    }

    const { activity_type } = req.body;

    if (!activity_type || typeof activity_type !== 'string') {
      return res.status(400).json({ error: "activity_type is required" });
    }

    const validTypes = ['prayer_submitted', 'prayer_response', 'budget_updated'];
    if (!validTypes.includes(activity_type)) {
      return res.status(400).json({ error: "Invalid activity_type" });
    }

    await storage.recordChurchActivity(churchId, activity_type);

    const updated = await storage.getChurchEngagementScore(churchId);
    return res.json(updated);
  } catch (error: any) {
    console.error("[Church Engagement POST] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}
