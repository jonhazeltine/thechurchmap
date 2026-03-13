import { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

/**
 * POST /api/boundaries/import
 * 
 * Bulk import boundaries using the fn_import_boundaries RPC function
 * This is for backend/admin use only - NOT exposed in the UI
 * 
 * Body: {
 *   boundaries: [
 *     {
 *       external_id: string,
 *       name: string,
 *       type: 'county' | 'city' | 'zip' | 'neighborhood' | 'school_district' | 'other',
 *       geometry: GeoJSON Polygon,
 *       source: string
 *     }
 *   ]
 * }
 */
export async function POST(req: Request, res: Response) {
  try {
    const { boundaries } = req.body;

    if (!Array.isArray(boundaries)) {
      return res.status(400).json({ error: 'boundaries must be an array' });
    }

    if (boundaries.length === 0) {
      return res.status(400).json({ error: 'boundaries array cannot be empty' });
    }

    // Use RPC function to bulk import
    const supabase = supabaseServer();
    const { data, error } = await supabase.rpc('fn_import_boundaries', {
      boundaries_data: boundaries
    });

    if (error) {
      console.error('Error importing boundaries:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json(data);
  } catch (err: any) {
    console.error('Error in boundaries import:', err);
    return res.status(500).json({ error: err.message });
  }
}
