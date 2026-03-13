import type { Request, Response } from 'express';
import { supabaseServer } from '../../../../lib/supabaseServer';

interface CollaborationLine {
  id: string;
  partnerId: string;
  partnerName: string;
  status: 'pending' | 'active' | 'paused';
  hasOverlap: boolean;
  sourceCoords: [number, number];
  targetCoords: [number, number];
  overlapCentroid?: [number, number];
}

export async function GET(req: Request, res: Response) {
  try {
    const { churchId } = req.query;
    
    if (!churchId || typeof churchId !== 'string') {
      return res.status(400).json({ error: 'churchId is required' });
    }

    const supabase = supabaseServer();

    const { data: sourceChurch, error: sourceError } = await supabase
      .from('churches')
      .select('id, name, location, primary_ministry_area')
      .eq('id', churchId)
      .single();

    if (sourceError || !sourceChurch) {
      return res.status(404).json({ error: 'Church not found' });
    }

    if (!sourceChurch.location) {
      return res.json({ lines: [], message: 'Source church has no location' });
    }

    const { data: collaborations, error: collabError } = await supabase
      .from('active_collaborations')
      .select(`
        id,
        church_a_id,
        church_b_id,
        status,
        description
      `)
      .or(`church_a_id.eq.${churchId},church_b_id.eq.${churchId}`)
      .in('status', ['pending', 'active', 'paused']);

    if (collabError || !collaborations || collaborations.length === 0) {
      return res.json({ lines: [] });
    }

    const partnerIds = collaborations.map(c => 
      c.church_a_id === churchId ? c.church_b_id : c.church_a_id
    );

    const { data: partners } = await supabase
      .from('churches')
      .select('id, name, location, primary_ministry_area')
      .in('id', partnerIds);

    if (!partners || partners.length === 0) {
      return res.json({ lines: [] });
    }

    const partnerMap = new Map(partners.map(p => [p.id, p]));

    const lines: CollaborationLine[] = [];

    for (const collab of collaborations) {
      const partnerId = collab.church_a_id === churchId ? collab.church_b_id : collab.church_a_id;
      const partner = partnerMap.get(partnerId);

      if (!partner || !partner.location) continue;

      const sourceLng = (sourceChurch.location as any).coordinates?.[0];
      const sourceLat = (sourceChurch.location as any).coordinates?.[1];
      const partnerLng = (partner.location as any).coordinates?.[0];
      const partnerLat = (partner.location as any).coordinates?.[1];

      if (!sourceLng || !sourceLat || !partnerLng || !partnerLat) continue;

      let hasOverlap = false;
      let overlapCentroid: [number, number] | undefined;

      if (sourceChurch.primary_ministry_area && partner.primary_ministry_area) {
        const { data: overlapData } = await supabase.rpc('fn_get_ministry_intersection_centroid', {
          p_church_a_id: churchId,
          p_church_b_id: partnerId
        });

        if (overlapData && overlapData.has_overlap) {
          hasOverlap = true;
          overlapCentroid = [overlapData.centroid_lng, overlapData.centroid_lat];
        }
      }

      // Always draw line to partner church; overlap centroid is shown as separate marker
      lines.push({
        id: collab.id,
        partnerId,
        partnerName: partner.name,
        status: collab.status as 'pending' | 'active' | 'paused',
        hasOverlap,
        sourceCoords: [sourceLng, sourceLat],
        targetCoords: [partnerLng, partnerLat], // Always connect to partner
        overlapCentroid // Shown as separate marker when present
      });
    }

    return res.json({ lines });

  } catch (error: any) {
    console.error('Collaboration lines error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
