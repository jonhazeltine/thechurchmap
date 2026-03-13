import type { Request, Response } from "express";
import { fetchFormationPrayers, fetchFormationPrayersByChallenge, fetchFormationChallenges } from "../../../../server/services/formation-prayer-exchange";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function GET(req: Request, res: Response) {
  try {
    const { church_id, formation_church_id, challenge_id, action } = req.query;

    let apiKey: string | null = null;

    if (formation_church_id) {
      const { data: churchRecord } = await supabaseServer()
        .from("churches")
        .select("id, formation_api_key")
        .eq("formation_church_id", formation_church_id as string)
        .single();
      apiKey = churchRecord?.formation_api_key || null;
    } else if (church_id) {
      const { data: churchRecord } = await supabaseServer()
        .from("churches")
        .select("formation_church_id, formation_api_key")
        .eq("id", church_id as string)
        .single();
      apiKey = churchRecord?.formation_api_key || null;
    }

    if (!apiKey) {
      return res.status(400).json({ error: "Church does not have a Formation API key configured" });
    }

    if (action === "challenges") {
      const challengesResult = await fetchFormationChallenges(apiKey);
      if (!challengesResult) {
        return res.status(503).json({ error: "Formation service unavailable" });
      }
      return res.status(200).json(challengesResult);
    }

    const result = challenge_id
      ? await fetchFormationPrayersByChallenge(apiKey, challenge_id as string)
      : await fetchFormationPrayers(apiKey);
    
    if (!result) {
      return res.status(503).json({ error: "Formation service unavailable" });
    }

    const rawPrayers = result.prayers || [];

    const normalizedPrayers = rawPrayers.map((p: any) => ({
      id: p.id,
      prayer_request_id: p.prayer_request_id || p.id,
      title: p.title || null,
      body: p.body || p.request_text || "",
      is_anonymous: p.is_anonymous ?? (!p.user_name),
      submitter_name: p.submitter_name || p.user_name || null,
      church_name: p.church_name || null,
      church_id: p.church_id || null,
      created_at: p.created_at,
      answered_at: p.answered_at || null,
      challenge_id: p.challenge_id || result.resolved_challenge_id,
    }));

    let syncedMap: Record<string, string> = {};
    const formationIds = normalizedPrayers.map((p: any) => p.prayer_request_id).filter(Boolean);
    
    if (formationIds.length > 0) {
      try {
        const { data: syncedPrayers } = await supabaseServer()
          .from("prayers")
          .select("id, formation_prayer_id")
          .in("formation_prayer_id", formationIds);
        
        if (syncedPrayers) {
          syncedPrayers.forEach((sp: any) => {
            syncedMap[sp.formation_prayer_id] = sp.id;
          });
        }
      } catch {
      }
    }

    return res.status(200).json({
      prayers: normalizedPrayers.map((p: any) => ({
        ...p,
        local_prayer_id: syncedMap[p.prayer_request_id] || null,
        is_synced: !!syncedMap[p.prayer_request_id],
      })),
      partner: result.partner || "",
      count: result.count || normalizedPrayers.length,
      resolved_challenge_id: result.resolved_challenge_id,
    });
  } catch (error) {
    console.error("Error in GET /api/formation/prayers:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
