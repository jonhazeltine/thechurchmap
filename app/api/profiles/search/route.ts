import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function GET(req: Request, res: Response) {
  try {
    const query = (req.query.q as string || '').trim();
    
    if (query.length < 1) {
      return res.json([]);
    }

    const supabase = supabaseServer();
    
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, full_name, first_name, avatar_url')
      .or(`full_name.ilike.%${query}%,first_name.ilike.%${query}%`)
      .limit(10);

    if (error) throw error;

    const results = (profiles || []).map(p => ({
      id: p.id,
      name: p.full_name || p.first_name || 'Unknown',
      avatar: p.avatar_url,
    }));

    res.json(results);
  } catch (error: any) {
    console.error('GET /api/profiles/search error:', error);
    res.status(500).json({ error: error.message });
  }
}
