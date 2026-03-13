import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

/**
 * GET /api/prayers/church-requests
 * Returns church-initiated prayer requests (is_church_request = true)
 * These are always visible and not subject to normal approval workflow
 * 
 * Query params:
 * - city_platform_id: optional platform filter
 * - limit: optional, default 5
 */
export async function GET(req: Request, res: Response) {
  try {
    const { city_platform_id, church_id, limit } = req.query;
    const maxLimit = Math.min(parseInt(limit as string) || 5, 20);

    const supabase = supabaseServer();

    let query = supabase
      .from("prayers")
      .select(`
        id,
        title,
        body,
        church_id,
        is_church_request,
        created_at,
        churches!inner (
          id,
          name
        )
      `)
      .eq("is_church_request", true)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(maxLimit);

    if (church_id) {
      query = query.eq("church_id", church_id);
    } else if (city_platform_id) {
      // When filtering by platform, we need to get prayers for churches in that platform
      // First get church IDs in the platform via platform_churches junction
      const { data: platformChurchIds } = await supabase
        .from("platform_churches")
        .select("church_id")
        .eq("city_platform_id", city_platform_id);
      
      if (platformChurchIds && platformChurchIds.length > 0) {
        query = query.in("church_id", platformChurchIds.map((pc: any) => pc.church_id));
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching church prayer requests:", error);
      return res.status(500).json({ error: "Failed to fetch church prayer requests" });
    }

    // Get interaction counts for these prayers
    const prayerIds = (data || []).map((p: any) => p.id);
    let interactionCounts: Record<string, number> = {};
    
    if (prayerIds.length > 0) {
      const { data: interactions } = await supabase
        .from("prayer_interactions")
        .select("prayer_id")
        .in("prayer_id", prayerIds);
      
      (interactions || []).forEach((i: any) => {
        interactionCounts[i.prayer_id] = (interactionCounts[i.prayer_id] || 0) + 1;
      });
    }

    // Transform response
    const requests = (data || []).map((prayer: any) => ({
      id: prayer.id,
      title: prayer.title,
      body: prayer.body,
      church_id: prayer.church_id,
      church_name: prayer.churches?.name || null,
      is_church_request: true,
      created_at: prayer.created_at,
      interaction_count: interactionCounts[prayer.id] || 0,
    }));

    return res.status(200).json({ requests });
  } catch (err) {
    console.error("Church prayer requests error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
