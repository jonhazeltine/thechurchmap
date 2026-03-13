import type { Request, Response } from "express";
import { supabaseServer } from "../../../lib/supabaseServer";
import { insertAreaSchema } from "@shared/schema";
import { canEditChurch, verifyAuth } from "../../../lib/authMiddleware";
import { computeAreaTractOverlaps } from "../../../server/services/ministry-saturation";

export async function GET(req: Request, res: Response) {
  try {
    const supabase = supabaseServer();
    const churchId = req.query.church_id as string | undefined;
    const type = req.query.type as string | undefined;
    
    const { data, error } = await supabase.rpc('get_areas');

    if (error) throw error;

    let filteredData = data || [];

    if (churchId) {
      filteredData = filteredData.filter((area: any) => area.church_id === churchId);
    }

    if (type) {
      filteredData = filteredData.filter((area: any) => area.type === type);
    }

    res.json(filteredData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

export async function POST(req: Request, res: Response) {
  try {
    const validatedData = insertAreaSchema.parse(req.body);
    
    if (validatedData.church_id) {
      const access = await canEditChurch(req, validatedData.church_id);
      if (!access.allowed) {
        return res.status(access.authenticationFailed ? 401 : 403).json({ 
          error: access.reason || 'Permission denied' 
        });
      }
    } else {
      const auth = await verifyAuth(req);
      if (!auth.authenticated) {
        return res.status(401).json({ error: 'Authentication required to create areas' });
      }
      if (!auth.isPlatformAdmin && !auth.isSuperAdmin) {
        return res.status(403).json({ error: 'Platform admin required to create non-church areas' });
      }
    }

    const supabase = supabaseServer();
    const geometryGeoJSON = JSON.stringify(validatedData.geometry);

    const { data, error } = await supabase.rpc('create_area', {
      p_name: validatedData.name,
      p_type: validatedData.type,
      p_church_id: validatedData.church_id || null,
      p_geometry_geojson: geometryGeoJSON,
      p_calling_id: validatedData.calling_id || null,
    });

    if (error) throw error;

    if (data && validatedData.geometry) {
      const areaId = typeof data === 'object' && 'id' in data ? data.id : data;
      if (areaId) {
        computeAreaTractOverlaps(String(areaId), validatedData.geometry, validatedData.church_id || undefined).catch(err =>
          console.error('[areas/POST] Background overlap compute failed:', err)
        );
      }
    }

    res.status(201).json(data);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}
