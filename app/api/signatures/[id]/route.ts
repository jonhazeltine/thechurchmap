import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function GET(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Signature ID is required" });
    }

    const { data: signature, error } = await supabaseServer()
      .from("document_signatures")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return res.status(404).json({ error: "Signature not found" });
      }
      console.error("Error fetching signature:", error);
      return res.status(500).json({ error: "Failed to fetch signature" });
    }

    return res.json(signature);
  } catch (error) {
    console.error("Error in GET /api/signatures/:id:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
