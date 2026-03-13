import type { Request, Response } from 'express';
import { supabaseServer } from '../../../../../../lib/supabaseServer';
import { canEditChurch } from '../../../../../../lib/authMiddleware';

export async function DELETE(req: Request, res: Response) {
  try {
    const { id: churchId, areaId } = req.params;

    const access = await canEditChurch(req, churchId);
    if (!access.allowed) {
      return res.status(access.authenticationFailed ? 401 : 403).json({ 
        error: access.reason || 'Permission denied' 
      });
    }

    const supabase = supabaseServer();

    const { data: area, error: fetchError } = await supabase
      .from('areas')
      .select('id, church_id, calling_id')
      .eq('id', areaId)
      .single();

    if (fetchError) throw fetchError;

    if (!area) {
      return res.status(404).json({ error: 'Area not found' });
    }

    if (area.church_id !== churchId) {
      return res.status(403).json({ error: 'This area does not belong to the specified church' });
    }

    if (!area.calling_id) {
      return res.status(400).json({ error: 'This area is not a calling-specific area' });
    }

    const { error: deleteError } = await supabase
      .from('areas')
      .delete()
      .eq('id', areaId);

    if (deleteError) throw deleteError;

    res.status(204).send();
  } catch (error: any) {
    console.error('DELETE /api/churches/:id/calling-areas/:areaId error:', error);
    res.status(500).json({ error: error.message });
  }
}
