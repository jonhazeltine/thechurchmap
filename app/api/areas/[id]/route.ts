import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";
import { canEditChurch, verifyAuth } from "../../../../lib/authMiddleware";
import { computeAreaTractOverlaps, invalidateAreaOverlaps } from "../../../../server/services/ministry-saturation";

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
      return res.status(404).json({ error: 'Area not found' });
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

    const { data, error } = await supabase
      .from('areas')
      .delete()
      .eq('id', id)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Area not found or could not be deleted' });
    }

    invalidateAreaOverlaps(id).catch(err =>
      console.error('[areas/DELETE] Background overlap invalidation failed:', err)
    );

    if (existingArea.church_id) {
      const churchId = existingArea.church_id;
      (async () => {
        try {
          const { data: remainingAreas } = await supabase
            .from('areas')
            .select('id')
            .eq('church_id', churchId)
            .limit(1);

          if (!remainingAreas || remainingAreas.length === 0) {
            await invalidateAreaOverlaps(`primary-${churchId}`);
            console.log(`[areas/DELETE] Cleaned up primary overlaps for church ${churchId} (no remaining areas)`);
          }
        } catch (err) {
          console.error('[areas/DELETE] Background primary overlap cleanup failed:', err);
        }
      })();
    }

    res.status(204).send();
  } catch (error: any) {
    console.error('Delete caught error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function PATCH(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, geometry } = req.body;
    const supabase = supabaseServer();

    const { data: existingArea, error: checkError } = await supabase
      .from('areas')
      .select('id, church_id')
      .eq('id', id)
      .single();

    if (checkError || !existingArea) {
      return res.status(404).json({ error: 'Area not found' });
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

    if (!name && !geometry) {
      return res.status(400).json({ error: 'Name or geometry is required' });
    }

    const updates: any = {};
    
    if (name) {
      updates.name = name.trim();
    }

    if (geometry) {
      const { error: rpcError } = await supabase.rpc('update_area_geometry', {
        p_area_id: id,
        p_geometry: geometry
      });

      if (rpcError) {
        console.error('Failed to update geometry:', rpcError);
        throw rpcError;
      }

      computeAreaTractOverlaps(id, geometry, existingArea.church_id || undefined).catch(err =>
        console.error('[areas/PATCH] Background overlap compute failed:', err)
      );
    }

    if (name) {
      const { data, error } = await supabase
        .from('areas')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } else {
      const { data, error } = await supabase
        .from('areas')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      res.json(data);
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
