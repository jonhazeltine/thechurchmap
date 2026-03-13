import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../../lib/supabaseServer";
import { z } from "zod";

const answeredSchema = z.object({
  prayer_id: z.string().uuid("Invalid prayer ID").optional(),
  formation_prayer_id: z.string().min(1).optional(),
  answered_note: z.string().max(500).optional().default(""),
}).refine(
  (data) => data.prayer_id || data.formation_prayer_id,
  { message: "Either prayer_id or formation_prayer_id is required" }
);

export async function PATCH(req: Request, res: Response) {
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

    const validationResult = answeredSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationResult.error.errors,
      });
    }

    const { prayer_id, formation_prayer_id, answered_note } = validationResult.data;
    const now = new Date().toISOString();

    if (prayer_id) {
      const { data: prayer, error: prayerError } = await supabaseServer()
        .from("prayers")
        .select("id, formation_prayer_id, answered_at, church_id")
        .eq("id", prayer_id)
        .single();

      if (prayerError || !prayer) {
        return res.status(404).json({ error: "Prayer not found" });
      }

      const { error: updateError } = await supabaseServer()
        .from("prayers")
        .update({
          answered_at: now,
          answered_by_user_id: user.id,
          answered_note: answered_note || null,
        })
        .eq("id", prayer_id);

      if (updateError) {
        console.error("Error marking prayer as answered:", updateError);
        return res.status(500).json({ error: "Failed to mark prayer as answered" });
      }
    } else if (formation_prayer_id) {
      const { data: localPrayer } = await supabaseServer()
        .from("prayers")
        .select("id")
        .eq("formation_prayer_id", formation_prayer_id)
        .maybeSingle();

      if (localPrayer) {
        await supabaseServer()
          .from("prayers")
          .update({
            answered_at: now,
            answered_by_user_id: user.id,
            answered_note: answered_note || null,
          })
          .eq("id", localPrayer.id);
      }
    }

    return res.status(200).json({
      success: true,
      answered_at: now,
      message: "Prayer marked as answered locally",
    });
  } catch (error) {
    console.error("Error in PATCH /api/formation/prayers/answered:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
