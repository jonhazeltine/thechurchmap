import type { Request, Response } from "express";
import { supabaseServer } from "../../../lib/supabaseServer";
import type { CollaborationTag } from "../../../shared/schema";

// GET /api/collaboration-taxonomy - Get active tags (public endpoint)
export async function GET(req: Request, res: Response) {
  try {
    // Use service role client since collaboration tags are public data
    // This avoids RLS issues when users are not authenticated
    const supabase = supabaseServer();

    // Fetch all active tags
    const { data: tags, error: tagsError } = await supabase
      .from('collaboration_tags')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (tagsError) {
      console.error('Error fetching tags:', tagsError);
      throw tagsError;
    }

    res.json({ tags: tags || [] });
  } catch (error: any) {
    console.error('GET /api/collaboration-taxonomy error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}
