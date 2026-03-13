import { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

/**
 * GET /api/boundaries/:id
 * 
 * Fetch a single boundary by ID
 */
export async function GET(req: Request, res: Response) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Boundary ID is required' });
    }

    const withGeometry = req.query.with_geometry === 'true';
    const supabase = supabaseServer();

    if (withGeometry) {
      const { data, error } = await supabase.rpc('fn_get_boundaries_with_geometry', {
        ids_json: JSON.stringify([id])
      });
      if (error) {
        console.error('Error fetching boundary with geometry:', error);
        return res.status(500).json({ error: error.message });
      }
      if (!data || data.length === 0) {
        return res.status(404).json({ error: 'Boundary not found' });
      }
      return res.json(data[0]);
    }

    const { data, error } = await supabase
      .from('boundaries')
      .select('id,name,type')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Boundary not found' });
      }
      console.error('Error fetching boundary:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json(data);
  } catch (err: any) {
    console.error('Error in boundary fetch:', err);
    return res.status(500).json({ error: err.message });
  }
}
