import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";
import { fetchTractPopulation } from "../../../../server/services/census-acs";
import { storage } from "../../../../server/storage";

function pointInPolygon(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInGeometry(lng: number, lat: number, geometry: any): boolean {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') {
    const outerRing = geometry.coordinates[0];
    if (!pointInPolygon(lng, lat, outerRing)) return false;
    for (let i = 1; i < geometry.coordinates.length; i++) {
      if (pointInPolygon(lng, lat, geometry.coordinates[i])) return false;
    }
    return true;
  }
  if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      const outerRing = polygon[0];
      if (!pointInPolygon(lng, lat, outerRing)) continue;
      let inHole = false;
      for (let i = 1; i < polygon.length; i++) {
        if (pointInPolygon(lng, lat, polygon[i])) { inHole = true; break; }
      }
      if (!inHole) return true;
    }
    return false;
  }
  return false;
}

export async function GET(req: Request, res: Response) {
  try {
    const { lng, lat } = req.query;

    if (!lng || !lat) {
      return res.status(400).json({ error: "lng and lat query parameters are required" });
    }

    const longitude = parseFloat(lng as string);
    const latitude = parseFloat(lat as string);

    if (isNaN(longitude) || isNaN(latitude)) {
      return res.status(400).json({ error: "lng and lat must be valid numbers" });
    }

    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      return res.status(400).json({ error: "lng must be between -180 and 180, lat between -90 and 90" });
    }

    const supabase = supabaseServer();

    let delta = 0.005;
    let tract: any = null;

    for (let attempt = 0; attempt < 3 && !tract; attempt++) {
      const { data: tractData, error: tractError } = await supabase.rpc('fn_boundaries_in_viewport', {
        min_lng: longitude - delta,
        min_lat: latitude - delta,
        max_lng: longitude + delta,
        max_lat: latitude + delta,
        boundary_type: 'census_tract',
        limit_count: 50,
      });

      if (tractError) {
        console.error("[Tract Resolve] RPC error:", tractError);
        return res.status(500).json({ error: tractError.message });
      }

      if (tractData && tractData.length > 0) {
        for (const candidate of tractData) {
          if (candidate.geometry && pointInGeometry(longitude, latitude, candidate.geometry)) {
            tract = candidate;
            break;
          }
        }
      }

      delta *= 3;
    }

    if (!tract) {
      return res.status(404).json({ error: "No tract found for the given coordinates" });
    }

    const { data: tractDetails } = await supabase
      .from('boundaries')
      .select('state_fips, county_fips')
      .eq('id', tract.id)
      .single();

    let friendly_label = tract.name || `Tract ${tract.external_id}`;

    try {
      const { data: placeData } = await supabase.rpc('fn_boundaries_in_viewport', {
        min_lng: longitude - 0.001,
        min_lat: latitude - 0.001,
        max_lng: longitude + 0.001,
        max_lat: latitude + 0.001,
        boundary_type: 'place',
        limit_count: 1,
      });

      if (placeData && placeData.length > 0) {
        friendly_label = `${tract.name} (${placeData[0].name})`;
      } else {
        const { data: countyData } = await supabase.rpc('fn_boundaries_in_viewport', {
          min_lng: longitude - 0.01,
          min_lat: latitude - 0.01,
          max_lng: longitude + 0.01,
          max_lat: latitude + 0.01,
          boundary_type: 'county',
          limit_count: 1,
        });

        if (countyData && countyData.length > 0) {
          friendly_label = `${tract.name} (${countyData[0].name})`;
        }
      }
    } catch (boundaryErr) {
      console.log("[Tract Resolve] Could not fetch boundary label, using tract name");
    }

    let population: number | null = null;
    if (tract.external_id) {
      const populations = await storage.getTractPopulations([tract.external_id]);
      population = populations.get(tract.external_id) ?? null;

      if (population === null) {
        const { data: popRow } = await supabase
          .from('boundaries_tracts')
          .select('population')
          .eq('geoid', tract.external_id)
          .single();
        if (popRow?.population) {
          population = popRow.population;
        }
      }

      if (population === null) {
        const censusPopulation = await fetchTractPopulation(tract.external_id);
        if (censusPopulation !== null) {
          population = censusPopulation;
          await storage.upsertTractPopulation(tract.external_id, censusPopulation);
        }
      }
    }

    return res.json({
      geoid: tract.external_id,
      name: tract.name,
      county_fips: tractDetails?.county_fips || null,
      state_fips: tractDetails?.state_fips || null,
      population,
      friendly_label,
    });
  } catch (error: any) {
    console.error("[Tract Resolve] Error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
}
