import { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, res: Response) {
  try {
    const { minLng, minLat, maxLng, maxLat, limit, platformId } = req.query;

    if (!minLng || !minLat || !maxLng || !maxLat) {
      return res.status(400).json({ 
        error: 'Missing required bounding box parameters (minLng, minLat, maxLng, maxLat)' 
      });
    }

    const bounds = {
      west: parseFloat(minLng as string),
      south: parseFloat(minLat as string),
      east: parseFloat(maxLng as string),
      north: parseFloat(maxLat as string),
    };

    if (Object.values(bounds).some(isNaN)) {
      return res.status(400).json({ error: 'Invalid bounding box coordinates' });
    }

    const supabase = supabaseServer();
    const limitCount = limit ? parseInt(limit as string, 10) : 500;
    
    // Resolve platform slug to UUID if needed
    let resolvedPlatformId: string | null = null;
    if (platformId && typeof platformId === 'string') {
      if (UUID_REGEX.test(platformId)) {
        resolvedPlatformId = platformId;
      } else {
        const { data: platform } = await supabase
          .from('city_platforms')
          .select('id')
          .eq('slug', platformId)
          .single();
        
        if (platform) {
          resolvedPlatformId = platform.id;
        }
      }
    }
    
    // Use the spatial RPC to get churches in bounding box
    const { data, error } = await supabase.rpc('fn_get_churches_with_coords_in_bbox', {
      west: bounds.west,
      south: bounds.south,
      east: bounds.east,
      north: bounds.north
    });

    if (error) {
      console.error('Error fetching churches in viewport:', error);
      
      const { data: fallbackData, error: fallbackError } = await supabase.rpc('fn_get_churches_in_bbox', {
        west: bounds.west,
        south: bounds.south,
        east: bounds.east,
        north: bounds.north
      });
      
      if (fallbackError) {
        return res.status(500).json({ error: fallbackError.message });
      }
      
      let result = fallbackData || [];
      
      // If platformId resolved, filter to platform churches
      if (resolvedPlatformId) {
        const { data: platformLinks } = await supabase
          .from('city_platform_churches')
          .select('church_id')
          .eq('city_platform_id', resolvedPlatformId)
          .in('status', ['visible', 'featured']);
        
        if (platformLinks) {
          const platformChurchIds = new Set(platformLinks.map(p => p.church_id));
          result = result.filter((c: any) => platformChurchIds.has(c.id));
        }
      }
      
      // Cache for 5 minutes at browser and CDN edge
      res.set('Cache-Control', 'public, max-age=300, s-maxage=300');
      return res.json(result.slice(0, limitCount));
    }

    let result = data || [];

    // If platformId resolved, filter to only platform-linked churches
    if (resolvedPlatformId) {
      const { data: platformLinks, error: platformError } = await supabase
        .from('city_platform_churches')
        .select('church_id')
        .eq('city_platform_id', resolvedPlatformId)
        .in('status', ['visible', 'featured']);

      if (platformError) {
        console.error('Error fetching platform church links:', platformError);
      } else if (platformLinks) {
        const platformChurchIds = new Set(platformLinks.map(p => p.church_id));
        result = result.filter((c: any) => platformChurchIds.has(c.id));
      }
    }

    // Cache for 5 minutes at browser and CDN edge
    res.set('Cache-Control', 'public, max-age=300, s-maxage=300');
    return res.json(result.slice(0, limitCount));
  } catch (err: any) {
    console.error('Error in GET /api/churches/in-viewport:', err);
    return res.status(500).json({ error: err.message });
  }
}
