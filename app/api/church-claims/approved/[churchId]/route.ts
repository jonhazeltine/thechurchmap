import { Request, Response } from "express";
import { supabaseServer } from "../../../../../lib/supabaseServer";
import { requireAnyChurchAdmin } from "../../../../../lib/authMiddleware";

export async function GET(req: Request, res: Response) {
  try {
    const authResult = await requireAnyChurchAdmin(req, res);
    if (!authResult.authorized) {
      return res.status(403).json({ error: "Access denied. Only church admins can view facility information." });
    }

    const churchId = req.params.churchId;

    if (!churchId) {
      return res.status(400).json({ error: "Church ID is required" });
    }

    const supabase = supabaseServer();
    const { data: claim, error } = await supabase
      .from("church_claims")
      .select("wizard_data")
      .eq("church_id", churchId)
      .eq("status", "approved")
      .order("reviewed_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching approved claim:", error);
      return res.status(500).json({ error: "Failed to fetch claim data" });
    }

    return res.json(claim || null);
  } catch (error) {
    console.error("Error in approved claim endpoint:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
