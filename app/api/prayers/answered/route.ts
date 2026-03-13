import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";
import { z } from "zod";

const querySchema = z.object({
  church_id: z.string().uuid().optional(),
  city_platform_id: z.string().uuid().optional(),
  limit: z.string().transform(Number).default("50"),
  offset: z.string().transform(Number).default("0"),
});

export async function GET(req: Request, res: Response) {
  try {
    const validationResult = querySchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validationResult.error.errors,
      });
    }

    const { church_id, city_platform_id, limit, offset } = validationResult.data;

    let query = supabaseServer()
      .from("prayers")
      .select(`
        id,
        title,
        body,
        is_anonymous,
        display_first_name,
        display_last_initial,
        created_at,
        answered_at,
        answered_note,
        is_church_request,
        church_id,
        churches:church_id (
          id,
          name,
          city,
          state,
          profile_photo_url
        )
      `)
      .not("answered_at", "is", null)
      .eq("status", "approved")
      .order("answered_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (church_id) {
      query = query.eq("church_id", church_id);
    }

    if (city_platform_id) {
      query = query.eq("city_platform_id", city_platform_id);
    }

    const { data: prayers, error: prayersError } = await query;

    if (prayersError) {
      console.error("Error fetching answered prayers:", prayersError);
      return res.status(500).json({ error: "Failed to fetch answered prayers" });
    }

    let countQuery = supabaseServer()
      .from("prayers")
      .select("id", { count: "exact", head: true })
      .not("answered_at", "is", null)
      .eq("status", "approved");

    if (church_id) {
      countQuery = countQuery.eq("church_id", church_id);
    }

    if (city_platform_id) {
      countQuery = countQuery.eq("city_platform_id", city_platform_id);
    }

    const { count, error: countError } = await countQuery;

    if (countError) {
      console.error("Error counting answered prayers:", countError);
    }

    return res.status(200).json({
      prayers: prayers || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Error in GET /api/prayers/answered:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
