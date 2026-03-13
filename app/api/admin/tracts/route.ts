import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function GET(req: Request, res: Response) {
  try {
    const supabase = supabaseServer();

    const { count: totalTracts, error: countError } = await supabase
      .from('boundaries')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'census_tract');

    if (countError) {
      console.error("[Admin Tracts] Count error:", countError);
      return res.status(500).json({ error: countError.message });
    }

    const { data: stateFipsData, error: stateError } = await supabase
      .from('boundaries')
      .select('state_fips')
      .eq('type', 'census_tract')
      .not('state_fips', 'is', null);

    if (stateError) {
      console.error("[Admin Tracts] State query error:", stateError);
      return res.status(500).json({ error: stateError.message });
    }

    const stateCounts = new Map<string, number>();
    const countySet = new Set<string>();

    for (const row of (stateFipsData || [])) {
      const sf = row.state_fips;
      if (sf) {
        stateCounts.set(sf, (stateCounts.get(sf) || 0) + 1);
      }
    }

    const { data: countyData } = await supabase
      .from('boundaries')
      .select('county_fips')
      .eq('type', 'census_tract')
      .not('county_fips', 'is', null);

    for (const row of (countyData || [])) {
      if (row.county_fips) countySet.add(row.county_fips);
    }

    const by_state = Array.from(stateCounts.entries())
      .map(([state_fips, tract_count]) => ({
        state_fips,
        tract_count,
        total_population: 0,
        tracts_with_population: 0,
      }))
      .sort((a, b) => a.state_fips.localeCompare(b.state_fips));

    return res.json({
      summary: {
        total_tracts: totalTracts || 0,
        total_population: 0,
        state_count: stateCounts.size,
        county_count: countySet.size,
      },
      by_state,
    });
  } catch (error: any) {
    console.error("[Admin Tracts] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}
