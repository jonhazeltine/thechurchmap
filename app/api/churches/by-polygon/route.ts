import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function POST(req: Request, res: Response) {
  try {
    const { polygon } = req.body;
    
    if (!polygon || !polygon.coordinates) {
      return res.status(400).json({ error: "Invalid polygon data" });
    }

    const supabase = supabaseServer();
    const polygonGeoJSON = JSON.stringify(polygon);

    const { data, error } = await supabase.rpc('fn_churches_in_polygon', {
      polygon_geojson: polygonGeoJSON,
    });

    if (error) throw error;

    const churches = await Promise.all(
      (data || []).map(async (church: any) => {
        const { data: callings } = await supabase
          .from('church_calling')
          .select('calling:callings(*)')
          .eq('church_id', church.id);

        return {
          ...church,
          callings: callings?.map((cc: any) => cc.calling).filter(Boolean) || [],
        };
      })
    );

    res.json(churches);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
