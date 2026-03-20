import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

// Helper to parse location to GeoJSON format
// The fn_get_churches_simple RPC returns location as GeoJSON object or string
function parseLocation(location: any): { type: string; coordinates: [number, number] } | null {
  if (!location) return null;
  
  if (typeof location === 'string') {
    try {
      const parsed = JSON.parse(location);
      if (parsed && parsed.coordinates) {
        return parsed;
      }
    } catch {
      return null;
    }
  } else if (typeof location === 'object' && location.coordinates) {
    return location;
  }
  return null;
}

export async function GET(req: Request, res: Response) {
  try {
    const { q, city_platform_id, jv_only } = req.query;
    const supabase = supabaseServer();
    const filterJvOnly = jv_only === 'true';

    // If no query provided, return first 100 churches (for admin dropdowns)
    if (!q || typeof q !== 'string') {
      let churchIds: { id: string }[] = [];
      
      if (city_platform_id && typeof city_platform_id === 'string') {
        // Platform context: use JOIN to get platform churches
        const { data: platformChurches, error } = await supabase
          .from('city_platform_churches')
          .select('church_id')
          .eq('city_platform_id', city_platform_id)
          .in('status', ['visible', 'featured'])
          .limit(100);
        
        if (error) throw error;
        churchIds = (platformChurches || []).map(pc => ({ id: pc.church_id }));
      } else {
        // No platform context: search all approved churches
        let query = supabase
          .from('churches')
          .select('id')
          .eq('approved', true);
        
        // Filter to only JV-active churches if requested
        if (filterJvOnly) {
          query = query.eq('partnership_status', 'active');
        }
        
        const { data: allChurches, error } = await query
          .order('name', { ascending: true })
          .limit(100);
        
        if (error) throw error;
        churchIds = allChurches || [];
      }
      
      if (churchIds.length === 0) {
        return res.json([]);
      }

      // Fetch full data with geometry via RPC
      const { data: churches, error } = await supabase
        .rpc('fn_get_churches_simple')
        .in('id', churchIds.map(c => c.id));
      
      if (error) throw error;

      const churchSummaries = (churches || [])
        .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
        .map((church: any) => ({
          id: church.id,
          name: church.name,
          address: church.address,
          city: church.city,
          state: church.state,
          zip: church.zip,
          denomination: church.denomination,
          location: parseLocation(church.location),
        }));

      return res.json(churchSummaries);
    }

    const searchTerm = q.trim();
    if (searchTerm.length < 2) {
      return res.json([]);
    }

    // Search for matching churches
    let matchedIds: { id: string }[] = [];
    
    // Different approach based on whether platform context is provided
    if (city_platform_id && typeof city_platform_id === 'string') {
      // Platform context: Get all platform churches with church data, then filter in-memory
      // This avoids URL length issues and works with Supabase's join limitations
      const { data: platformChurches, error: platformError } = await supabase
        .from('city_platform_churches')
        .select(`
          church_id,
          churches!inner (
            id,
            name,
            address,
            city,
            state,
            zip
          )
        `)
        .eq('city_platform_id', city_platform_id)
        .in('status', ['visible', 'featured']);
      
      if (platformError) {
        console.error(`🔍 Search: Join query error:`, platformError);
        throw platformError;
      }
      
      // Filter in-memory by search term (case-insensitive)
      const searchLower = searchTerm.toLowerCase();
      const filtered = (platformChurches || []).filter((r: any) => {
        const church = r.churches;
        return (
          (church.name && church.name.toLowerCase().includes(searchLower)) ||
          (church.city && church.city.toLowerCase().includes(searchLower)) ||
          (church.address && church.address.toLowerCase().includes(searchLower)) ||
          (church.zip && church.zip.toLowerCase().includes(searchLower))
        );
      });
      
      matchedIds = filtered.slice(0, 10).map((r: any) => ({ id: r.church_id }));
      console.log(`🔍 Search: Platform filter applied, found ${matchedIds.length} matching churches for "${searchTerm}" (from ${platformChurches?.length || 0} platform churches)`);
    } else {
      // No platform context: search all approved churches
      console.log(`🔍 Search: No platform filter applied, searching all approved churches${filterJvOnly ? ' (JV-only)' : ''}`);
      let query = supabase
        .from('churches')
        .select('id')
        .eq('approved', true);
      
      // Filter to only JV-active churches if requested
      if (filterJvOnly) {
        query = query.eq('partnership_status', 'active');
      }
      
      const { data: allMatches, error: allSearchError } = await query
        .or(`name.ilike.%${searchTerm}%,city.ilike.%${searchTerm}%,address.ilike.%${searchTerm}%,zip.ilike.%${searchTerm}%`)
        .order('name', { ascending: true })
        .limit(10);
      
      if (allSearchError) throw allSearchError;
      matchedIds = allMatches || [];
      console.log(`🔍 Search: Found ${matchedIds.length} matching churches for "${searchTerm}"${filterJvOnly ? ' (JV-only)' : ''}`);
    }
    
    if (matchedIds.length === 0) {
      return res.json([]);
    }

    // Fetch full data with geometry via RPC for matched IDs
    const { data: churches, error } = await supabase
      .rpc('fn_get_churches_simple')
      .in('id', matchedIds.map(c => c.id));

    if (error) {
      console.error(`Church search RPC error:`, error);
      throw error;
    }

    const churchSummaries = (churches || [])
      .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
      .map((church: any) => ({
        id: church.id,
        name: church.name,
        address: church.address,
        city: church.city,
        state: church.state,
        zip: church.zip,
        denomination: church.denomination,
        location: parseLocation(church.location),
      }));

    res.json(churchSummaries);
  } catch (error: any) {
    console.error('GET /api/churches/search error:', error);
    res.status(500).json({ error: error.message });
  }
}
