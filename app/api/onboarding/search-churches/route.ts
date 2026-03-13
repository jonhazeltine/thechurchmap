import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";
import { z } from "zod";

const searchSchema = z.object({
  query: z.string().min(1, "Search query required"),
  limit: z.number().min(1).max(50).optional().default(20),
});

export async function GET(req: Request, res: Response) {
  try {
    const query = req.query.query as string;
    const limit = parseInt(req.query.limit as string) || 20;

    const validation = searchSchema.safeParse({ query, limit });
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const supabase = supabaseServer();

    const { data, error } = await supabase.rpc('fn_search_churches_for_onboarding', {
      search_query: query,
      result_limit: limit,
    });

    if (error) {
      console.error('Error searching churches:', error);
      
      // Fallback to direct query if RPC doesn't exist yet
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('churches')
        .select(`
          id,
          name,
          address,
          city,
          state,
          denomination
        `)
        .or(`name.ilike.%${query}%,address.ilike.%${query}%,city.ilike.%${query}%`)
        .limit(limit);

      if (fallbackError) {
        throw fallbackError;
      }

      // Get platform info for each church
      const churchIds = fallbackData?.map(c => c.id) || [];
      const { data: platformLinks } = await supabase
        .from('city_platform_churches')
        .select(`
          church_id,
          city_platforms!inner (
            id,
            name,
            is_active
          )
        `)
        .in('church_id', churchIds)
        .eq('status', 'visible');

      const platformMap = new Map();
      platformLinks?.forEach((link: any) => {
        if (link.city_platforms?.is_active) {
          platformMap.set(link.church_id, {
            id: link.city_platforms.id,
            name: link.city_platforms.name,
          });
        }
      });

      const results = fallbackData?.map(church => ({
        ...church,
        platform: platformMap.get(church.id) || null,
      })) || [];

      return res.json(results);
    }

    // Format RPC results
    const results = data?.map((row: any) => ({
      id: row.id,
      name: row.name,
      address: row.address,
      city: row.city,
      state: row.state,
      denomination: row.denomination,
      platform: row.platform_id ? {
        id: row.platform_id,
        name: row.platform_name,
      } : null,
    })) || [];

    res.json(results);
  } catch (error: any) {
    console.error('Error in church search:', error);
    res.status(500).json({ error: error.message });
  }
}
