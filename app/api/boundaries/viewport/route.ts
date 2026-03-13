import { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

// Map frontend filter values to actual database type values
const TYPE_MAPPINGS: Record<string, string[]> = {
  'city': ['place', 'Place'],
  'place': ['place', 'Place'],
  'county': ['county', 'County'],
  'zip': ['zip', 'Zip'],
  'county_subdivision': ['county_subdivision', 'county subdivision'],
  'school_district': ['school_district', 'School District'],
};

// Types to always exclude from results
const isExcludedType = (type: string | null | undefined): boolean => {
  if (!type) return false;
  const lowerType = type.toLowerCase();
  return lowerType.includes('tract') || lowerType.includes('census');
};

/**
 * GET /api/boundaries/viewport
 * 
 * Fetch boundaries within a map viewport (bounding box)
 * Uses fn_boundaries_in_viewport RPC which returns GeoJSON geometry
 */
export async function GET(req: Request, res: Response) {
  try {
    const { minLng, minLat, maxLng, maxLat, type, limit, includeChurchCounts } = req.query;

    if (!minLng || !minLat || !maxLng || !maxLat) {
      return res.status(400).json({ 
        error: 'Missing required bounding box parameters (minLng, minLat, maxLng, maxLat)' 
      });
    }

    const bounds = {
      minLng: parseFloat(minLng as string),
      minLat: parseFloat(minLat as string),
      maxLng: parseFloat(maxLng as string),
      maxLat: parseFloat(maxLat as string),
    };

    if (Object.values(bounds).some(isNaN)) {
      return res.status(400).json({ error: 'Invalid bounding box coordinates' });
    }

    const limitCount = limit ? parseInt(limit as string, 10) : 500;
    const shouldIncludeChurchCounts = includeChurchCounts === 'true';
    
    // Handle comma-separated types (for additive zoom-based filtering)
    const requestedType = type as string;
    const requestedTypes = requestedType ? requestedType.split(',').map(t => t.trim()) : [];
    
    // If multiple types or 'all', pass null to RPC to get all boundaries
    // Then filter on the backend
    const mappedType = requestedTypes.length === 1 && requestedTypes[0] !== 'all'
      ? (TYPE_MAPPINGS[requestedTypes[0]]?.[0] || requestedTypes[0])
      : null;

    const supabase = supabaseServer();
    
    // Call fn_boundaries_in_viewport - returns GeoJSON geometry directly
    const { data, error } = await supabase.rpc('fn_boundaries_in_viewport', {
      min_lng: bounds.minLng,
      min_lat: bounds.minLat,
      max_lng: bounds.maxLng,
      max_lat: bounds.maxLat,
      boundary_type: mappedType,
      limit_count: limitCount
    });

    // If the RPC doesn't exist, return a clear error
    if (error) {
      const isMissingFunction = error.code === 'PGRST202' || 
        error.message?.includes('Could not find the function');
      
      if (isMissingFunction) {
        console.error('fn_boundaries_in_viewport RPC not found. Run migration 0079-fn-boundaries-in-viewport.sql');
        return res.status(503).json({ 
          error: 'Boundary viewport function not available',
          details: 'Database migration required: 0079-fn-boundaries-in-viewport.sql',
          code: 'MIGRATION_REQUIRED'
        });
      }
      
      console.error('Error fetching boundaries:', error);
      return res.status(500).json({ error: error.message });
    }

    let resultData = data || [];
    
    // Exclude census tracts
    resultData = resultData.filter((b: any) => !isExcludedType(b.type));
    
    // Apply type filtering if needed (handles multiple comma-separated types)
    if (requestedTypes.length > 0 && !requestedTypes.includes('all')) {
      // Build list of all allowed database types from requested types
      const allowedDbTypes: string[] = [];
      for (const reqType of requestedTypes) {
        const mapped = TYPE_MAPPINGS[reqType];
        if (mapped) {
          allowedDbTypes.push(...mapped);
        } else {
          allowedDbTypes.push(reqType);
        }
      }
      
      resultData = resultData.filter((b: any) => 
        allowedDbTypes.some(allowed => 
          b.type?.toLowerCase() === allowed.toLowerCase()
        )
      );
    }
    
    // Add church counts if requested
    if (shouldIncludeChurchCounts && resultData.length > 0) {
      const boundaryIds = resultData.map((b: any) => b.id);
      
      // Use efficient SQL query to count churches per boundary
      const { data: churches, error: countError } = await supabase
        .from('churches')
        .select('boundary_ids')
        .filter('approved', 'eq', true)
        .overlaps('boundary_ids', boundaryIds);
      
      if (!countError && churches) {
        const countMap = new Map<string, number>();
        const boundaryIdSet = new Set(boundaryIds);
        
        for (const church of churches) {
          if (church.boundary_ids && Array.isArray(church.boundary_ids)) {
            for (const boundaryId of church.boundary_ids) {
              if (boundaryIdSet.has(boundaryId)) {
                countMap.set(boundaryId, (countMap.get(boundaryId) || 0) + 1);
              }
            }
          }
        }
        
        resultData = resultData.map((b: any) => ({
          ...b,
          church_count: countMap.get(b.id) || 0
        }));
      }
    }

    return res.json(resultData);
  } catch (err: any) {
    console.error('Error in GET /api/boundaries/viewport:', err);
    return res.status(500).json({ error: err.message });
  }
}
