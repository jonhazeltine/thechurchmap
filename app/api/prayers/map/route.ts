import { supabaseServer } from "../../../../lib/supabaseServer";
import type { Request, Response } from "express";

interface ChurchData {
  id: string;
  name: string;
  address: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
}

interface ChurchWithPrayers {
  id: string;
  name: string;
  address: string;
  location: {
    type: 'Point';
    coordinates: [number, number];
  };
  prayer_count: number;
  recent_prayers: Array<{
    id: string;
    title: string;
    created_at: string;
  }>;
}

export async function GET(req: Request, res: Response) {
  try {
    const { bbox, zoom } = req.query;

    console.log('🙏 PRAYER MAP REQUEST:', { bbox, zoom });

    if (!bbox || !zoom) {
      return res.status(400).json({
        error: "Missing required parameters: bbox and zoom"
      });
    }

    const zoomLevel = parseFloat(zoom as string);
    const [west, south, east, north] = (bbox as string).split(',').map(parseFloat);

    console.log('🙏 Parsed bounds:', { west, south, east, north, zoomLevel });

    if ([west, south, east, north].some(isNaN) || isNaN(zoomLevel)) {
      return res.status(400).json({
        error: "Invalid bbox or zoom format"
      });
    }

    const supabase = supabaseServer();

    // Use the same RPC function as /api/churches for consistent location formatting
    const { data: allChurches, error: churchesError } = await supabase.rpc('fn_get_churches_simple');

    // Filter churches by bounding box - handle GeoJSON format
    const churches: ChurchData[] = (allChurches || []).filter((church: any) => {
      // GeoJSON format: { type: 'Point', coordinates: [lng, lat] }
      if (!church.location?.coordinates || church.location.coordinates.length !== 2) {
        return false;
      }
      const [lng, lat] = church.location.coordinates;
      return lat >= south && lat <= north && lng >= west && lng <= east;
    });

    if (churchesError) {
      console.error("Error fetching churches:", churchesError);
      return res.status(500).json({ error: "Failed to fetch church data" });
    }

    if (!churches || churches.length === 0) {
      return res.json({
        churches: [],
        total_prayer_count: 0,
        zoom_level: zoomLevel
      });
    }

    // Get church IDs and convert to Set for efficient lookup
    const churchIds = churches.map((c: ChurchData) => c.id);
    const churchIdSet = new Set(churchIds);

    // Fetch approved prayers for these churches
    console.log('🙏 Prayer Map Debug:', {
      churchIdsInViewport: churchIds,
      churchCount: churchIds.length,
      newLifeId: '83bd03c6-a440-4513-b13c-250acac81349',
      newLifeInViewport: churchIds.includes('83bd03c6-a440-4513-b13c-250acac81349'),
    });

    // Query ALL approved prayers (avoid HeadersOverflowError with large churchIds array)
    const { data: allPrayers, error: prayersError } = await supabase
      .from('prayers')
      .select('id, church_id, title, created_at, status')
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (prayersError) {
      console.error("Error fetching prayers:", prayersError);
      return res.status(500).json({ error: "Failed to fetch prayer data" });
    }

    // Filter prayers client-side to only include those from churches in viewport
    const prayers = (allPrayers || []).filter((prayer: any) => 
      churchIdSet.has(prayer.church_id)
    );

    let tractPrayers: any[] = [];
    try {
      const { data: tractData, error: tractError } = await supabase.rpc('fn_boundaries_in_viewport', {
        min_lng: west,
        min_lat: south,
        max_lng: east,
        max_lat: north,
        boundary_type: 'census_tract',
        limit_count: 2000,
      });

      if (tractError) {
        console.error('Error fetching tracts from Supabase:', tractError);
      }

      const geoids = (tractData || []).map((r: any) => r.external_id).filter(Boolean);
      if (geoids.length > 0) {
        const { data: tractPrayerData } = await supabase
          .from('prayers')
          .select('id, church_id, title, created_at, status, scope_type, tract_id')
          .eq('status', 'approved')
          .eq('scope_type', 'tract')
          .in('tract_id', geoids)
          .order('created_at', { ascending: false })
          .limit(30);
        tractPrayers = tractPrayerData || [];
      }
    } catch (err) {
      console.error('Error fetching tract prayers for map:', err);
    }

    console.log('Prayers Query Result:', {
      prayersFound: prayers?.length || 0,
      tractPrayersFound: tractPrayers?.length || 0,
      error: prayersError,
    });

    // Group prayers by church
    const churchPrayerMap = new Map<string, Array<{ id: string; title: string; created_at: string }>>();
    
    prayers.forEach((prayer: any) => {
      if (!churchPrayerMap.has(prayer.church_id)) {
        churchPrayerMap.set(prayer.church_id, []);
      }
      churchPrayerMap.get(prayer.church_id)!.push({
        id: prayer.id,
        title: prayer.title,
        created_at: prayer.created_at
      });
    });

    // Format the response - only include churches that have prayers
    const churchesWithPrayers: ChurchWithPrayers[] = churches
      .filter((church: ChurchData) => churchPrayerMap.has(church.id))
      .map((church: ChurchData) => {
        const churchPrayers = churchPrayerMap.get(church.id) || [];
        return {
          id: church.id,
          name: church.name,
          address: church.address,
          location: church.location,
          prayer_count: churchPrayers.length,
          recent_prayers: churchPrayers.slice(0, 5)
        };
      });

    const totalChurchPrayers = churchesWithPrayers.reduce((sum: number, c: ChurchWithPrayers) => sum + c.prayer_count, 0);
    return res.json({
      churches: churchesWithPrayers,
      total_prayer_count: totalChurchPrayers + tractPrayers.length,
      tract_prayer_count: tractPrayers.length,
      zoom_level: zoomLevel
    });

  } catch (error) {
    console.error("Error in GET /api/prayers/map:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
