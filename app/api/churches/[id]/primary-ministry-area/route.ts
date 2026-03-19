import type { Request, Response } from 'express';
import { supabaseServer } from '../../../../../lib/supabaseServer';
import { canEditChurch } from '../../../../../lib/authMiddleware';
import { computeAreaTractOverlaps, invalidateAreaOverlaps } from '../../../../../server/services/ministry-saturation';

export async function PATCH(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const access = await canEditChurch(req, id);
    if (!access.allowed) {
      return res.status(access.authenticationFailed ? 401 : 403).json({ 
        error: access.reason || 'Permission denied' 
      });
    }

    const { area_id, geometry } = req.body;
    const supabase = supabaseServer();

    let finalGeometry = geometry;

    if (area_id) {
      const { error: unsetError } = await supabase
        .from('areas')
        .update({ is_primary: false })
        .eq('church_id', id)
        .eq('is_primary', true);

      if (unsetError) {
        console.error('[primary-ministry-area/PATCH] Error unsetting old primary:', unsetError);
      }

      const { error: setError } = await supabase
        .from('areas')
        .update({ is_primary: true })
        .eq('id', area_id)
        .eq('church_id', id);

      if (setError) throw setError;

      if (!finalGeometry) {
        const { data: areas } = await supabase.rpc('get_areas');
        const area = areas?.find((a: any) => a.id === area_id);
        if (area?.geometry) {
          finalGeometry = area.geometry;
        }
      }
    }

    if (!finalGeometry || finalGeometry.type !== 'Polygon') {
      return res.status(400).json({ error: 'Invalid geometry. Must be a Polygon.' });
    }

    if (!finalGeometry.coordinates || !Array.isArray(finalGeometry.coordinates) || finalGeometry.coordinates.length === 0) {
      return res.status(400).json({ error: 'Invalid geometry coordinates.' });
    }

    const coordinates = finalGeometry.coordinates[0];
    
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length === 0) {
      return res.status(400).json({ error: 'Invalid polygon coordinates.' });
    }
    
    const wktCoordinates = coordinates
      .map((coord: number[]) => `${coord[0]} ${coord[1]}`)
      .join(', ');
    const wkt = `POLYGON((${wktCoordinates}))`;

    const { data, error } = await supabase.rpc('fn_update_primary_ministry_area', {
      church_uuid: id,
      area_wkt: `SRID=4326;${wkt}`
    });

    if (error) throw error;

    if (!area_id) {
      const { data: oldPrimaryAreas } = await supabase
        .from('areas')
        .select('id')
        .eq('church_id', id)
        .eq('is_primary', true);

      const oldAreaIds = (oldPrimaryAreas || []).map((a: any) => a.id);

      const { error: deleteOldError } = await supabase
        .from('areas')
        .delete()
        .eq('church_id', id)
        .eq('is_primary', true);

      if (deleteOldError) throw deleteOldError;

      for (const oldId of oldAreaIds) {
        invalidateAreaOverlaps(oldId).catch(err =>
          console.error('[primary-ministry-area/PATCH] Background overlap invalidation failed for old area:', err)
        );
      }

      const { data: church } = await supabase
        .from('churches')
        .select('name')
        .eq('id', id)
        .single();

      const areaName = `${church?.name || 'Church'} Ministry Area`;
      const geometryGeoJSON = JSON.stringify(finalGeometry);

      const { data: newArea, error: createAreaError } = await supabase.rpc('create_area', {
        p_name: areaName,
        p_type: 'church',
        p_church_id: id,
        p_geometry_geojson: geometryGeoJSON,
      });

      if (createAreaError) throw createAreaError;

      const newAreaId = typeof newArea === 'object' && 'id' in newArea ? newArea.id : newArea;

      const { error: setPrimaryError } = await supabase
        .from('areas')
        .update({ is_primary: true })
        .eq('id', newAreaId);

      if (setPrimaryError) throw setPrimaryError;

      if (newAreaId) {
        computeAreaTractOverlaps(String(newAreaId), finalGeometry, id).catch(err =>
          console.error('[primary-ministry-area/PATCH] Background area overlap compute failed:', err)
        );
      }
    }

    computeAreaTractOverlaps(`primary-${id}`, finalGeometry, id).catch(err =>
      console.error('[primary-ministry-area/PATCH] Background overlap compute failed:', err)
    );

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('PATCH /api/churches/:id/primary-ministry-area error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function DELETE(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const access = await canEditChurch(req, id);
    if (!access.allowed) {
      return res.status(access.authenticationFailed ? 401 : 403).json({ 
        error: access.reason || 'Permission denied' 
      });
    }

    const supabase = supabaseServer();

    const { data: primaryAreas } = await supabase
      .from('areas')
      .select('id')
      .eq('church_id', id)
      .eq('is_primary', true);

    const areaIds = (primaryAreas || []).map((a: any) => a.id);

    const { error: deleteAreasError } = await supabase
      .from('areas')
      .delete()
      .eq('church_id', id)
      .eq('is_primary', true);

    if (deleteAreasError) throw deleteAreasError;

    const { error } = await supabase.rpc('fn_delete_primary_ministry_area', {
      church_uuid: id
    });

    if (error) throw error;

    for (const areaId of areaIds) {
      invalidateAreaOverlaps(areaId).catch(err =>
        console.error('[primary-ministry-area/DELETE] Background overlap invalidation failed:', err)
      );
    }
    invalidateAreaOverlaps(`primary-${id}`).catch(err =>
      console.error('[primary-ministry-area/DELETE] Background overlap invalidation failed:', err)
    );

    res.status(204).send();
  } catch (error: any) {
    console.error('DELETE /api/churches/:id/primary-ministry-area error:', error);
    res.status(500).json({ error: error.message });
  }
}
