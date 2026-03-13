import { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

/**
 * GET /api/boundaries/by-ids
 * 
 * Fetch boundaries by their IDs with GeoJSON geometry
 * Used for loading initial selections in the boundary map picker
 * 
 * Query params:
 *   - ids: Array of boundary IDs (can be specified multiple times)
 */
export async function GET(req: Request, res: Response) {
  try {
    const ids = req.query.ids;

    if (!ids) {
      return res.status(400).json({ 
        error: 'Missing required ids parameter' 
      });
    }

    const idArray = Array.isArray(ids) ? ids : [ids];
    
    if (idArray.length === 0) {
      return res.json([]);
    }

    const supabase = supabaseServer();
    
    // Use fn_get_boundaries_by_ids RPC if available - this is the most reliable method
    // It returns boundaries with proper GeoJSON geometry for the specific IDs requested
    const { data: rpcData, error: rpcError } = await supabase.rpc('fn_get_boundaries_by_ids', {
      boundary_ids: idArray
    });

    if (!rpcError && rpcData) {
      console.log(`[by-ids] Fetched ${rpcData.length}/${idArray.length} boundaries via fn_get_boundaries_by_ids`);
      return res.json(rpcData);
    }
    
    // If RPC doesn't exist, log the error and try alternative approach
    if (rpcError) {
      console.log(`[by-ids] fn_get_boundaries_by_ids not available: ${rpcError.message}`);
    }
    
    // Alternative: Use fn_boundaries_in_viewport with world bounds and filter
    // This is slower but works if fn_get_boundaries_by_ids doesn't exist
    const { data: allData, error } = await supabase.rpc('fn_boundaries_in_viewport', {
      min_lng: -180,
      min_lat: -90,
      max_lng: 180,
      max_lat: 90,
      boundary_type: null,
      limit_count: 50000 // Increased limit to ensure we get all boundaries
    });

    if (error) {
      console.error('Error fetching boundaries via viewport RPC:', error);
      
      // Last resort fallback: fetch from table directly
      // Note: We can't get geometry via Supabase client without RPC/PostGIS function
      const { data: tableData, error: tableError } = await supabase
        .from('boundaries')
        .select('id, name, type, external_id')
        .in('id', idArray as string[]);

      if (tableError) {
        console.error('Table fallback also failed:', tableError);
        return res.status(500).json({ error: tableError.message });
      }

      // Return without geometry - client will need to refetch via viewport
      console.log(`[by-ids] Fallback: returning ${tableData?.length || 0} boundaries WITHOUT geometry`);
      const result = (tableData || []).map(boundary => ({
        id: boundary.id,
        name: boundary.name,
        type: boundary.type,
        external_id: boundary.external_id,
        geometry: null
      }));

      return res.json(result);
    }

    // Filter the viewport results to only include requested IDs
    const idSet = new Set(idArray);
    const filteredData = (allData || []).filter((b: any) => idSet.has(b.id));
    
    console.log(`[by-ids] Fetched ${filteredData.length}/${idArray.length} boundaries via viewport RPC`);
    
    // Log geometry status for debugging
    filteredData.forEach((b: any) => {
      console.log(`[by-ids] Boundary ${b.name}: geometry=${b.geometry ? 'present' : 'NULL'}`);
    });
    
    return res.json(filteredData);
  } catch (err: any) {
    console.error('Error in GET /api/boundaries/by-ids:', err);
    return res.status(500).json({ error: err.message });
  }
}
