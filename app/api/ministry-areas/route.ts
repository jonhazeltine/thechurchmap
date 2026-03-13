import type { Request, Response } from "express";
import { supabaseServer } from "../../../lib/supabaseServer";
import { z } from "zod";
import { CALLING_COLORS, MAP_AREA_COLORS, type CallingType } from "@shared/schema";
import { canEditChurch, verifyAuth } from "../../../lib/authMiddleware";
import { computeAreaTractOverlaps } from "../../../server/services/ministry-saturation";
import { storage } from "../../../server/storage";

const ministryAreaSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["neighborhood", "corridor", "church"]),
  church_id: z.string().uuid().nullable().optional(),
  calling_type: z.enum(["place", "people", "problem", "purpose"]).nullable().optional(),
  geometry: z.any().nullable().optional(),
});

export async function GET(req: Request, res: Response) {
  try {
    const supabase = supabaseServer();
    const platformId = req.query.platform_id as string | undefined;
    
    // Get platform church IDs if filtering by platform
    let platformChurchIds: Set<string> | null = null;
    if (platformId) {
      const { data: platformChurches } = await supabase
        .from("city_platform_churches")
        .select("church_id")
        .eq("city_platform_id", platformId);
      
      platformChurchIds = new Set((platformChurches || []).map((pc: any) => pc.church_id));
    }
    
    const { data: areas, error } = await supabase.rpc("get_areas");

    if (error) {
      console.error("Error fetching ministry areas:", error);
      return res.status(500).json({ error: error.message });
    }

    const { data: callings } = await supabase
      .from("callings")
      .select("id, type, name");
    
    const callingTypeMap = new Map<string, string>();
    const callingNameMap = new Map<string, string>();
    (callings || []).forEach((c: any) => {
      callingTypeMap.set(c.id, c.type);
      callingNameMap.set(c.id, c.name);
    });

    let areaPopulations = { byAreaId: new Map<string, number>(), byChurchId: new Map<string, number>() };
    try {
      areaPopulations = await storage.getAreaPopulations();
    } catch (err) {
      console.error("Error fetching area populations:", err);
    }

    const areasWithChurches = await Promise.all(
      (areas || [])
        // Filter by platform if specified
        .filter((area: any) => {
          if (!platformChurchIds) return true; // No platform filter
          if (!area.church_id) return false; // Global areas excluded when filtering by platform
          return platformChurchIds.has(area.church_id);
        })
        .map(async (area: any) => {
          let church_name = null;
          
          if (area.church_id) {
            const { data: church } = await supabase
              .from("churches")
              .select("name")
              .eq("id", area.church_id)
              .single();
            church_name = church?.name || null;
          }
          
          const calling_type = area.calling_id ? callingTypeMap.get(area.calling_id) || null : null;
          const calling_name = area.calling_id ? callingNameMap.get(area.calling_id) || null : null;
          
          const calling_color = calling_type 
            ? CALLING_COLORS[calling_type as CallingType] 
            : MAP_AREA_COLORS.defaultCalling;
          
          return {
            ...area,
            church_name,
            calling_type,
            calling_name,
            calling_color,
            is_primary: area.is_primary || false,
            population: areaPopulations.byAreaId.get(area.id) || (area.church_id ? areaPopulations.byChurchId.get(area.church_id) : null) || null,
          };
        })
    );

    return res.json(areasWithChurches);
  } catch (err: any) {
    console.error("Error in GET /api/ministry-areas:", err);
    return res.status(500).json({ error: err.message });
  }
}

export async function POST(req: Request, res: Response) {
  try {
    const validatedData = ministryAreaSchema.parse(req.body);
    
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
        return res.status(401).json({ error: 'Authentication required to create ministry areas' });
      }
      if (!auth.isPlatformAdmin && !auth.isSuperAdmin) {
        return res.status(403).json({ error: 'Platform admin required to create non-church areas' });
      }
    }

    const supabase = supabaseServer();
    
    if (validatedData.geometry) {
      const geometryGeoJSON = JSON.stringify(validatedData.geometry);
      const { data, error } = await supabase.rpc('create_area', {
        p_name: validatedData.name,
        p_type: validatedData.type,
        p_church_id: validatedData.church_id || null,
        p_geometry_geojson: geometryGeoJSON,
      });

      if (error) throw error;

      if (data && validatedData.geometry) {
        const areaId = typeof data === 'object' && 'id' in data ? data.id : data;
        if (areaId) {
          computeAreaTractOverlaps(String(areaId), validatedData.geometry, validatedData.church_id || undefined).catch(err =>
            console.error('[ministry-areas/POST] Background overlap compute failed:', err)
          );
        }
      }

      if (validatedData.calling_type && data) {
        const areaId = typeof data === 'object' && 'id' in data ? data.id : data;
        const { error: updateError } = await supabase
          .from('areas')
          .update({ calling_type: validatedData.calling_type })
          .eq('id', areaId);
        
        if (updateError) throw updateError;
      }

      return res.status(201).json(data);
    } else {
      const { data, error } = await supabase
        .from('areas')
        .insert({
          name: validatedData.name,
          type: validatedData.type,
          church_id: validatedData.church_id || null,
          calling_type: validatedData.calling_type || null,
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    }
  } catch (error: any) {
    console.error("Error creating ministry area:", error);
    return res.status(400).json({ error: error.message });
  }
}
