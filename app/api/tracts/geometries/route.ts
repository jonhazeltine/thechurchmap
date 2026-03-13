import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

export async function GET(req: Request, res: Response) {
  try {
    const { bbox, geoids } = req.query;

    if (!bbox && !geoids) {
      return res.status(400).json({ error: "Either bbox or geoids query parameter is required" });
    }

    const supabase = supabaseServer();
    let features: any[] = [];

    if (geoids) {
      const geoidList = (geoids as string).split(",").map(g => g.trim()).filter(Boolean);
      if (geoidList.length === 0) {
        return res.status(400).json({ error: "geoids must contain at least one value" });
      }
      if (geoidList.length > 500) {
        return res.status(400).json({ error: "Maximum 500 geoids per request" });
      }

      const { data: boundaryRows, error: lookupError } = await supabase
        .from('boundaries')
        .select('id')
        .eq('type', 'census_tract')
        .in('external_id', geoidList);

      if (lookupError) {
        console.error("[Tract Geometries] Lookup error:", lookupError);
        return res.status(500).json({ error: lookupError.message });
      }

      const boundaryIds = (boundaryRows || []).map((r: any) => r.id);

      if (boundaryIds.length > 0) {
        const { data: geoData, error: geoError } = await supabase.rpc('fn_get_boundaries_by_ids', {
          boundary_ids: boundaryIds,
        });

        if (geoError) {
          console.error("[Tract Geometries] RPC error:", geoError);
          return res.status(500).json({ error: geoError.message });
        }

        const geoExternalIds = (geoData || []).map((r: any) => r.external_id).filter(Boolean);
        const populationMap: Record<string, number | null> = {};
        if (geoExternalIds.length > 0) {
          const { data: popData } = await supabase
            .from('boundaries_tracts')
            .select('geoid, population')
            .in('geoid', geoExternalIds);
          if (popData) {
            for (const p of popData) {
              populationMap[p.geoid] = p.population;
            }
          }
        }

        features = (geoData || []).map((row: any) => ({
          type: "Feature" as const,
          properties: {
            geoid: row.external_id,
            name: row.name,
            population: populationMap[row.external_id] ?? null,
          },
          geometry: typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry,
        }));
      }
    } else {
      const [minLng, minLat, maxLng, maxLat] = (bbox as string).split(",").map(Number);

      if ([minLng, minLat, maxLng, maxLat].some(isNaN)) {
        return res.status(400).json({ error: "Invalid bbox format. Expected: minLng,minLat,maxLng,maxLat" });
      }

      const { data, error } = await supabase.rpc('fn_boundaries_in_viewport', {
        min_lng: minLng,
        min_lat: minLat,
        max_lng: maxLng,
        max_lat: maxLat,
        boundary_type: 'census_tract',
        limit_count: 2000,
      });

      if (error) {
        console.error("[Tract Geometries] RPC error:", error);
        return res.status(500).json({ error: error.message });
      }

      const bboxExternalIds = (data || []).map((r: any) => r.external_id).filter(Boolean);
      const bboxPopMap: Record<string, number | null> = {};
      if (bboxExternalIds.length > 0) {
        const { data: popData } = await supabase
          .from('boundaries_tracts')
          .select('geoid, population')
          .in('geoid', bboxExternalIds);
        if (popData) {
          for (const p of popData) {
            bboxPopMap[p.geoid] = p.population;
          }
        }
      }

      features = (data || []).map((row: any) => ({
        type: "Feature" as const,
        properties: {
          geoid: row.external_id,
          name: row.name,
          population: bboxPopMap[row.external_id] ?? null,
        },
        geometry: typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry,
      }));
    }

    return res.json({
      type: "FeatureCollection",
      features,
    });
  } catch (error: any) {
    console.error("[Tract Geometries] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}
