import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../../lib/supabaseServer";
import { submitPrayerToFormation } from "../../../../../server/services/formation-prayer-exchange";
import { z } from "zod";

const pushSchema = z.object({
  prayer_id: z.string().uuid("Invalid prayer ID"),
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

    const validationResult = pushSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationResult.error.errors,
      });
    }

    const { prayer_id } = validationResult.data;

    const { data: prayer, error: prayerError } = await supabaseServer()
      .from("prayers")
      .select(`
        id, title, body, is_anonymous, display_first_name, display_last_initial,
        church_id, formation_prayer_id, status,
        churches:church_id (id, name, formation_church_id, formation_api_key)
      `)
      .eq("id", prayer_id)
      .single();

    if (prayerError || !prayer) {
      return res.status(404).json({ error: "Prayer not found" });
    }

    if (prayer.formation_prayer_id) {
      return res.status(409).json({ 
        error: "Prayer already synced to Formation",
        formation_prayer_id: prayer.formation_prayer_id,
      });
    }

    if (prayer.status !== "approved") {
      return res.status(400).json({ error: "Only approved prayers can be pushed to Formation" });
    }

    const titlePart = prayer.title || "";
    const bodyPart = prayer.body || "";
    const requestText = titlePart && bodyPart
      ? `${titlePart}: ${bodyPart}`
      : titlePart || bodyPart;
    if (!requestText) {
      return res.status(400).json({ error: "Prayer has no content to push" });
    }

    const churchData = prayer.churches as any;
    const apiKey = churchData?.formation_api_key;
    if (!apiKey) {
      return res.status(400).json({ error: "Church does not have a Formation API key configured" });
    }

    let userName: string | undefined;
    if (!prayer.is_anonymous) {
      const parts = [prayer.display_first_name, prayer.display_last_initial].filter(Boolean);
      if (parts.length > 0) {
        userName = parts.join(" ");
      }
    }

    const result = await submitPrayerToFormation(apiKey, requestText, userName);

    if (!result?.success) {
      return res.status(502).json({ error: "Failed to push prayer to Formation" });
    }

    const now = new Date().toISOString();
    if (result.prayer_request_id) {
      try {
        await supabaseServer()
          .from("prayers")
          .update({
            formation_prayer_id: result.prayer_request_id,
            formation_synced_at: now,
            formation_source: false,
          })
          .eq("id", prayer_id);
      } catch {
      }
    }

    return res.status(200).json({
      success: true,
      formation_prayer_id: result.prayer_request_id || null,
      message: "Prayer submitted to Formation (pending their admin approval)",
    });
  } catch (error) {
    console.error("Error in POST /api/formation/prayers/push:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
