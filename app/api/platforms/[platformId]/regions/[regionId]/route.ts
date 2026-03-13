import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";
import wkx from "wkx";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Convert WKB hex string to GeoJSON
function wkbToGeoJSON(wkbHex: string): any {
  try {
    const buffer = Buffer.from(wkbHex, 'hex');
    const geometry = wkx.Geometry.parse(buffer);
    return geometry.toGeoJSON();
  } catch (e) {
    console.error('Failed to parse WKB:', e);
    return null;
  }
}

async function resolvePlatformId(
  supabase: ReturnType<typeof supabaseServer>,
  platformIdOrSlug: string
): Promise<{ id: string; name: string; is_public: boolean } | null> {
  if (UUID_REGEX.test(platformIdOrSlug)) {
    const { data } = await supabase
      .from('city_platforms')
      .select('id, name, is_public')
      .eq('id', platformIdOrSlug)
      .single();
    return data;
  }
  
  const { data } = await supabase
    .from('city_platforms')
    .select('id, name, is_public')
    .eq('slug', platformIdOrSlug)
    .single();
  return data;
}

export async function GET(req: Request, res: Response) {
  try {
    const adminClient = supabaseServer();
    const { platformId: platformIdOrSlug, regionId } = req.params;

    if (!platformIdOrSlug || !regionId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    if (!UUID_REGEX.test(regionId)) {
      return res.status(400).json({ error: 'Invalid region ID format' });
    }

    const resolvedPlatform = await resolvePlatformId(adminClient, platformIdOrSlug);
    if (!resolvedPlatform) {
      return res.status(404).json({ error: 'Platform not found' });
    }
    const platformId = resolvedPlatform.id;

    const { data: region, error: regionError } = await adminClient
      .from('platform_regions')
      .select('id, name, color, cover_image_url, sort_order, city_platform_id')
      .eq('id', regionId)
      .eq('city_platform_id', platformId)
      .single();

    if (regionError || !region) {
      return res.status(404).json({ error: 'Region not found in this platform' });
    }

    const { data: regionBoundaries, error: rbError } = await adminClient
      .from('region_boundaries')
      .select('boundary_id')
      .eq('region_id', regionId);

    if (rbError) {
      console.error('Error fetching region boundaries:', rbError);
      return res.status(500).json({ error: 'Failed to fetch region boundaries' });
    }

    const boundaryIds = (regionBoundaries || []).map((rb: any) => rb.boundary_id);
    
    let boundaryGeometries: any[] = [];
    
    if (boundaryIds.length > 0) {
      // Query boundaries with raw geometry (WKB format)
      const { data: boundariesWithGeom, error: boundaryError } = await adminClient
        .from('boundaries')
        .select(`
          id,
          name,
          type,
          external_id,
          geometry
        `)
        .in('id', boundaryIds);

      if (boundaryError) {
        console.error('Error fetching boundaries:', boundaryError);
      } else if (boundariesWithGeom) {
        // Convert WKB geometry to GeoJSON for each boundary
        boundaryGeometries = boundariesWithGeom.map((boundary: any) => ({
          ...boundary,
          geometry: boundary.geometry ? wkbToGeoJSON(boundary.geometry) : null,
        }));
        console.log(`Converted ${boundaryGeometries.filter(b => b.geometry).length}/${boundaryGeometries.length} boundary geometries to GeoJSON`);
      }
    }

    return res.status(200).json({
      ...region,
      boundaries: boundaryGeometries,
    });

  } catch (error) {
    console.error('Error in GET /api/platforms/:platformId/regions/:regionId:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
