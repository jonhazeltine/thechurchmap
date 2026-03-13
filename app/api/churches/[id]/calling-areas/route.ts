import type { Request, Response } from 'express';
import { supabaseServer } from '../../../../../lib/supabaseServer';
import { canEditChurch } from '../../../../../lib/authMiddleware';

export async function GET(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const supabase = supabaseServer();

    // Use get_areas RPC which properly converts geometry to GeoJSON
    const { data: allAreas, error } = await supabase.rpc('get_areas');

    if (error) throw error;

    // Filter areas by church_id and only include those with a calling_id
    const churchCallingAreas = (allAreas || []).filter(
      (area: any) => area.church_id === id && area.calling_id !== null
    );

    // Fetch calling details for each area
    const callingIds = [...new Set(churchCallingAreas.map((a: any) => a.calling_id))];
    
    let callingsMap = new Map();
    if (callingIds.length > 0) {
      const { data: callings } = await supabase
        .from('callings')
        .select('*')
        .in('id', callingIds);
      
      if (callings) {
        callings.forEach((c: any) => callingsMap.set(c.id, c));
      }
    }

    // Attach calling details to each area
    const areasWithCallings = churchCallingAreas.map((area: any) => ({
      ...area,
      callings: area.calling_id ? callingsMap.get(area.calling_id) : null
    }));

    res.json(areasWithCallings);
  } catch (error: any) {
    console.error('GET /api/churches/:id/calling-areas error:', error);
    res.status(500).json({ error: error.message });
  }
}

export async function POST(req: Request, res: Response) {
  try {
    const { id: churchId } = req.params;

    const access = await canEditChurch(req, churchId);
    if (!access.allowed) {
      return res.status(access.authenticationFailed ? 401 : 403).json({ 
        error: access.reason || 'Permission denied' 
      });
    }

    const { calling_id, geometry, name } = req.body;

    if (!calling_id) {
      return res.status(400).json({ error: 'calling_id is required' });
    }

    if (!geometry || geometry.type !== 'Polygon') {
      return res.status(400).json({ error: 'Invalid geometry. Must be a Polygon.' });
    }

    const supabase = supabaseServer();

    const { data: existing } = await supabase
      .from('areas')
      .select('id')
      .eq('church_id', churchId)
      .eq('calling_id', calling_id)
      .maybeSingle();

    const coordinates = geometry.coordinates[0];
    const wktCoordinates = coordinates
      .map((coord: number[]) => `${coord[0]} ${coord[1]}`)
      .join(', ');
    const wkt = `POLYGON((${wktCoordinates}))`;

    if (existing) {
      const { data, error } = await supabase
        .from('areas')
        .update({
          geometry: `SRID=4326;${wkt}`,
          name: name || 'Calling-specific area'
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      res.json(data);
    } else {
      const { data, error } = await supabase
        .from('areas')
        .insert({
          church_id: churchId,
          calling_id: calling_id,
          name: name || 'Calling-specific area',
          type: 'custom',
          geometry: `SRID=4326;${wkt}`
        })
        .select()
        .single();

      if (error) throw error;
      res.status(201).json(data);
    }
  } catch (error: any) {
    console.error('POST /api/churches/:id/calling-areas error:', error);
    res.status(500).json({ error: error.message });
  }
}
