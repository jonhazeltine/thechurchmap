import type { Request, Response } from "express";
import { supabaseServer, supabaseUserClient } from "../../../../../lib/supabaseServer";
import { fetchFormationPrayers } from "../../../../../server/services/formation-prayer-exchange";
import { z } from "zod";

const syncSchema = z.object({
  formation_prayer_id: z.string().min(1),
  church_id: z.string().uuid("Invalid church ID"),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  is_anonymous: z.boolean().default(false),
  submitter_name: z.string().optional(),
  city_platform_id: z.string().uuid().optional(),
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

    const validationResult = syncSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationResult.error.errors,
      });
    }

    const { formation_prayer_id, church_id, title, body, is_anonymous, submitter_name, city_platform_id } = validationResult.data;

    // Check if already synced
    const { data: existing } = await supabaseServer()
      .from("prayers")
      .select("id")
      .eq("formation_prayer_id", formation_prayer_id)
      .maybeSingle();

    if (existing) {
      return res.status(200).json({
        prayer: existing,
        message: "Prayer already synced",
        already_synced: true,
      });
    }

    // Verify church exists and has formation_church_id set
    const { data: church } = await supabaseServer()
      .from("churches")
      .select("id, name, prayer_auto_approve, formation_church_id")
      .eq("id", church_id)
      .single();

    if (!church) {
      return res.status(404).json({ error: "Church not found" });
    }

    if (!church.formation_church_id) {
      return res.status(400).json({ error: "Church is not connected to Formation. Please set your Formation Church ID first." });
    }

    // Create local prayer record
    const prayerData: any = {
      church_id,
      title,
      body,
      is_anonymous,
      status: church.prayer_auto_approve ? "approved" : "pending",
      formation_prayer_id,
      formation_source: true,
      formation_synced_at: new Date().toISOString(),
      submitted_by_user_id: user.id,
      city_platform_id: city_platform_id || null,
      is_church_request: false,
      global: false,
    };

    if (!is_anonymous && submitter_name) {
      const parts = submitter_name.split(" ");
      prayerData.display_first_name = parts[0] || null;
      prayerData.display_last_initial = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
    }

    const { data: prayer, error: insertError } = await supabaseServer()
      .from("prayers")
      .insert(prayerData)
      .select()
      .single();

    if (insertError) {
      console.error("Error syncing Formation prayer:", insertError);
      return res.status(500).json({ error: "Failed to sync prayer" });
    }

    return res.status(201).json({
      prayer,
      message: "Formation prayer synced successfully",
      already_synced: false,
    });
  } catch (error) {
    console.error("Error in POST /api/formation/prayers/sync:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function GET(req: Request, res: Response) {
  try {
    const { church_id } = req.query;

    let query = supabaseServer()
      .from("prayers")
      .select("id, formation_prayer_id, formation_synced_at, title, status, answered_at")
      .not("formation_prayer_id", "is", null)
      .order("created_at", { ascending: false });

    if (church_id) {
      query = query.eq("church_id", church_id as string);
    }

    const { data, error } = await query;

    if (error) {
      if (error.message?.includes("does not exist")) {
        return res.status(200).json({ prayers: [], migration_pending: true });
      }
      console.error("Error fetching synced Formation prayers:", error);
      return res.status(500).json({ error: "Failed to fetch synced prayers" });
    }

    return res.status(200).json({ prayers: data || [] });
  } catch (error) {
    console.error("Error in GET /api/formation/prayers/sync:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
