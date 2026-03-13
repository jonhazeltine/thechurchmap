import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../../lib/supabaseServer";
import { submitPrayerResponse } from "../../../../../server/services/formation-prayer-exchange";
import { z } from "zod";

const respondSchema = z.object({
  prayer_request_id: z.string().min(1, "Prayer request ID is required"),
  response_text: z.string().min(1, "Response text is required").max(2000, "Response too long"),
  church_id: z.string().uuid("Invalid church ID"),
});

export async function POST(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.substring(7);
    const userClient = supabaseUserClient(token);
    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const validationResult = respondSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationResult.error.errors,
      });
    }

    const { prayer_request_id, response_text, church_id } = validationResult.data;

    const { data: churchRecord } = await supabaseServer()
      .from("churches")
      .select("formation_api_key")
      .eq("id", church_id)
      .single();

    const apiKey = churchRecord?.formation_api_key;
    if (!apiKey) {
      return res.status(400).json({ error: "Church does not have a Formation API key configured" });
    }

    const success = await submitPrayerResponse(apiKey, prayer_request_id, response_text);

    if (!success) {
      return res.status(502).json({ error: "Failed to submit response to Formation" });
    }

    return res.status(200).json({ 
      success: true, 
      message: "Prayer response submitted to Formation" 
    });
  } catch (error) {
    console.error("Error in POST /api/formation/prayers/respond:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
