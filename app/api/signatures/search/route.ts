import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function GET(req: Request, res: Response) {
  try {
    const { id, email } = req.query;

    if (!id && !email) {
      return res.status(400).json({ 
        error: "Please provide a signature ID or email to search" 
      });
    }

    let query = supabaseServer()
      .from("document_signatures")
      .select("*");

    if (id) {
      query = query.eq("id", id as string);
    }

    if (email) {
      query = query.eq("signer_email", email as string);
    }

    const { data: signatures, error } = await query.order("signed_at", { ascending: false });

    if (error) {
      console.error("Error searching signatures:", error);
      return res.status(500).json({ error: "Failed to search signatures" });
    }

    return res.json({ signatures: signatures || [] });
  } catch (error) {
    console.error("Error in GET /api/signatures/search:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
