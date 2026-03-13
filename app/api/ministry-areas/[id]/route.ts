import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";
import { z } from "zod";
import { canEditChurch, verifyAuth } from "../../../../lib/authMiddleware";
import { computeAreaTractOverlaps, invalidateAreaOverlaps } from "../../../../server/services/ministry-saturation";

const updateMinistryAreaSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["neighborhood", "corridor", "church"]).optional(),
  church_id: z.string().uuid().nullable().optional(),
  calling_type: z.enum(["place", "people", "problem", "purpose"]).nullable().optional(),
  geometry: z.any().nullable().optional(),
});

export async function GET(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const supabase = supabaseServer();

    const { data: areas, error } = await supabase.rpc('get_areas');

    if (error) throw error;

    const area = areas?.find((a: any) => a.id === id);

    if (!area) {
      return res.status(404).json({ error: 'Ministry area not found' });
    }

    if (area.church_id) {
      const { data: areaDetails, error: detailError } = await supabase
        .from('areas')
        .select('calling_type')
        .eq('id', id)
        .single();

      if (!detailError && areaDetails) {
        area.calling_type = areaDetails.calling_type;
      }

      const { data: church, error: churchError } = await supabase
        .from('churches')
        .select('id, name')
        .eq('id', area.church_id)
        .single();
      
      if (!churchError && church) {
        area.church = church;
      }
    } else {
      const { data: areaDetails, error: detailError } = await supabase
        .from('areas')
        .select('calling_type')
        .eq('id', id)
        .single();

      if (!detailError && areaDetails) {
        area.calling_type = areaDetails.calling_type;
      }
    }

    return res.json(area);
  } catch (error: any) {
    console.error("Error fetching ministry area:", error);
    return res.status(500).json({ error: error.message });
  }
}

export async function PUT(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const supabase = supabaseServer();

    const { data: existingArea, error: checkError } = await supabase
      .from('areas')
      .select('id, church_id')
      .eq('id', id)
      .single();

    if (checkError || !existingArea) {
      return res.status(404).json({ error: 'Ministry area not found' });
    }

    if (existingArea.church_id) {
      const access = await canEditChurch(req, existingArea.church_id);
      if (!access.allowed) {
        return res.status(access.authenticationFailed ? 401 : 403).json({ 
          error: access.reason || 'Permission denied' 
        });
      }
    } else {
      const auth = await verifyAuth(req);
      if (!auth.authenticated) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      if (!auth.isPlatformAdmin && !auth.isSuperAdmin) {
        return res.status(403).json({ error: 'Platform admin required to edit non-church areas' });
      }
    }

    const validatedData = updateMinistryAreaSchema.parse(req.body);

    const updates: any = {};
    if (validatedData.name !== undefined) updates.name = validatedData.name;
    if (validatedData.type !== undefined) updates.type = validatedData.type;
    if (validatedData.church_id !== undefined) updates.church_id = validatedData.church_id;
    if (validatedData.calling_type !== undefined) updates.calling_type = validatedData.calling_type;

    if (validatedData.geometry !== undefined && validatedData.geometry !== null) {
      const { error: rpcError } = await supabase.rpc('update_area_geometry', {
        p_area_id: id,
        p_geometry: validatedData.geometry as any
      });

      if (rpcError) throw rpcError;

      computeAreaTractOverlaps(id, validatedData.geometry, existingArea.church_id || undefined).catch(err =>
        console.error('[ministry-areas/PUT] Background overlap compute failed:', err)
      );
    }

    if (Object.keys(updates).length > 0) {
      const { data, error } = await supabase
        .from('areas')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({ error: 'Ministry area not found' });
      }

      return res.json(data);
    } else if (validatedData.geometry !== undefined) {
      const { data, error } = await supabase
        .from('areas')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return res.json(data);
    } else {
      return res.status(400).json({ error: 'No fields to update' });
    }
  } catch (error: any) {
    console.error("Error updating ministry area:", error);
    return res.status(400).json({ error: error.message });
  }
}

export async function DELETE(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const supabase = supabaseServer();

    const { data: existingArea, error: checkError } = await supabase
      .from('areas')
      .select('id, church_id')
      .eq('id', id)
      .single();

    if (checkError || !existingArea) {
      return res.status(404).json({ error: 'Ministry area not found' });
    }

    if (existingArea.church_id) {
      const access = await canEditChurch(req, existingArea.church_id);
      if (!access.allowed) {
        return res.status(access.authenticationFailed ? 401 : 403).json({ 
          error: access.reason || 'Permission denied' 
        });
      }
    } else {
      const auth = await verifyAuth(req);
      if (!auth.authenticated) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      if (!auth.isPlatformAdmin && !auth.isSuperAdmin) {
        return res.status(403).json({ error: 'Platform admin required to delete non-church areas' });
      }
    }

    const { error } = await supabase.rpc('delete_area', {
      p_area_id: id
    });

    if (error) {
      if (error.message?.includes('not found') || error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Ministry area not found' });
      }
      throw error;
    }

    invalidateAreaOverlaps(id).catch(err =>
      console.error('[ministry-areas/DELETE] Background overlap invalidation failed:', err)
    );

    return res.status(204).send();
  } catch (error: any) {
    console.error("Error deleting ministry area:", error);
    return res.status(500).json({ error: error.message });
  }
}
