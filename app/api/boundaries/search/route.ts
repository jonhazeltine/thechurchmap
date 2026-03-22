import { Request, Response} from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

// State FIPS to abbreviation mapping
const STATE_FIPS_TO_ABBREV: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT',
  '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL',
  '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD',
  '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE',
  '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD',
  '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV',
  '55': 'WI', '56': 'WY', '72': 'PR', '78': 'VI',
};

// State abbreviation to FIPS mapping (reverse)
const STATE_ABBREV_TO_FIPS: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_FIPS_TO_ABBREV).map(([fips, abbrev]) => [abbrev, fips])
);

// Map frontend filter values to actual database type values
// Same mapping as used in viewport route for consistency
const TYPE_MAPPINGS: Record<string, string[]> = {
  'city': ['place', 'Place'],
  'City': ['place', 'Place'],
  'Place': ['place', 'Place'],
  'place': ['place', 'Place'],
  'county': ['county', 'County'],
  'County': ['county', 'County'],
  'zip': ['zip', 'Zip', 'ZIP'],
  'ZIP': ['zip', 'Zip', 'ZIP'],
  'Zip': ['zip', 'Zip', 'ZIP'],
  'county_subdivision': ['county_subdivision', 'county subdivision'],
  'school_district': ['school_district', 'School District'],
  'School District': ['school_district', 'School District'],
};

/**
 * GET /api/boundaries/search?q=<query>&type=<type>&state=<state_code>
 * 
 * Search boundaries by name with optional type and state filters
 * Returns up to 50 results, prioritizing state matches when specified
 * 
 * Query params:
 *   - q: Search query (partial match, case-insensitive)
 *   - type: Optional filter by boundary type (county, city, zip, neighborhood, school_district, other)
 *   - state: Optional 2-letter state code to prioritize/filter results (e.g., "MI", "CA")
 * 
 * Note: This endpoint searches the boundaries table, NOT areas.
 * Boundaries are large-scale datasets (cities, counties, etc.) used for lookup only.
 */
export async function GET(req: Request, res: Response) {
  try {
    const q = (req.query.q as string) || '';
    const type = req.query.type as string | undefined;
    const stateCode = (req.query.state as string)?.toUpperCase();
    const withGeometry = req.query.with_geometry === 'true';
    const cityPlatformId = req.query.city_platform_id as string | undefined;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    // Map the incoming type to the database type
    // The RPC uses exact matching, so we need to try multiple variants
    let mappedType = type || null;
    if (type && TYPE_MAPPINGS[type]) {
      // Use the first variant (lowercase version typically used in DB)
      mappedType = TYPE_MAPPINGS[type][0];
    }

    // Convert state code to FIPS for filtering
    const stateFips = stateCode ? STATE_ABBREV_TO_FIPS[stateCode] : null;

    const supabase = supabaseServer();
    const searchQuery = `%${q.trim()}%`;

    let rawData: any[] | null = null;
    let error: any = null;

    // If platform ID is provided, use spatial filtering against platform geometry
    if (cityPlatformId) {
      const { data: spatialData, error: spatialError } = await supabase.rpc(
        'fn_search_boundaries_in_platform',
        {
          p_query: q.trim(),
          p_pid: cityPlatformId,
          p_type: mappedType || null,
          p_limit: 100,
        }
      );

      if (spatialError) {
        // Fallback to unfiltered search if spatial RPC fails
        console.error('Spatial search error, falling back:', spatialError.message);
        const result = await supabase
          .from('boundaries')
          .select('id, name, type, external_id, state_fips')
          .ilike('name', searchQuery)
          .neq('type', 'census_tract')
          .limit(300)
          .order('name');
        rawData = result.data;
        error = result.error;
      } else {
        // Enrich with county name from platform boundaries
        const { data: platformBounds } = await supabase
          .from('city_platform_boundaries')
          .select('boundary_id, boundaries(name, external_id, type)')
          .eq('city_platform_id', cityPlatformId);

        const countyMap = new Map<string, string>();
        for (const pb of (platformBounds || [])) {
          const b = (pb as any).boundaries;
          if (b?.type === 'county' && b.external_id) {
            countyMap.set(b.external_id, b.name);
          }
        }

        rawData = (spatialData || []).map((b: any) => {
          let county_name = null;
          if (b.external_id && countyMap.size > 0) {
            for (const [countyExtId, name] of countyMap) {
              if (b.external_id.startsWith(countyExtId) && b.external_id !== countyExtId) {
                county_name = name;
                break;
              }
            }
          }
          return { ...b, county_name };
        });
      }
    } else {
      // No platform context — search all boundaries
      let query = supabase
        .from('boundaries')
        .select('id, name, type, external_id, state_fips')
        .ilike('name', searchQuery)
        .limit(300);

      if (mappedType) {
        query = query.eq('type', mappedType);
      }
      query = query.order('name');

      const result = await query;
      rawData = result.data;
      error = result.error;
    }
    
    // Apply state filter in memory. Zip codes are always included because their state_fips
    // is unreliable in the DB (e.g. zip "49507" gets fips "49" = Utah, not Michigan).
    // The enrichment step already nullifies state_fips for zip types.
    const isZipRaw = (type: string) => ['zip', 'Zip', 'ZIP'].includes(type);
    const data = (rawData || []).filter((b: any) => {
      if (!stateFips) return true; // No state filter — include everything
      if (isZipRaw(b.type)) return true; // Zips have unreliable state_fips — always include
      if (!b.state_fips) return true; // No state_fips — include (can't filter)
      return b.state_fips === stateFips; // Match state
    });

    if (error) {
      console.error('Error searching boundaries:', error);
      return res.status(500).json({ error: error.message });
    }

    const isZipType = (type: string) => type === 'zip' || type === 'Zip' || type === 'ZIP';
    
    const enrichedData = (data || []).map((b: any) => {
      if (isZipType(b.type)) {
        return { ...b, state_fips: null, state_code: null };
      }
      
      let finalStateFips = b.state_fips;
      
      if (!finalStateFips && b.external_id) {
        const potentialStateFips = b.external_id.substring(0, 2);
        const fipsNum = parseInt(potentialStateFips, 10);
        if (!isNaN(fipsNum) && ((fipsNum >= 1 && fipsNum <= 56) || fipsNum === 72 || fipsNum === 78)) {
          finalStateFips = potentialStateFips;
        }
      }
      
      const stateAbbrev = finalStateFips ? STATE_FIPS_TO_ABBREV[finalStateFips] : null;
      
      return { 
        ...b, 
        state_fips: finalStateFips,
        state_code: stateAbbrev 
      };
    });

    const deduped = (() => {
      const seen = new Set<string>();
      const result: any[] = [];
      for (const b of enrichedData) {
        if (!seen.has(b.id)) {
          seen.add(b.id);
          result.push(b);
        }
      }
      return result;
    })();

    // If with_geometry is requested, fetch full boundary data with GeoJSON conversion
    if (withGeometry && deduped.length > 0) {
      const ids = deduped.map((b: any) => b.id);
      
      // Use raw SQL to fetch boundaries with ST_AsGeoJSON conversion
      // This avoids the UUID/text type mismatch issue in the RPC function
      const { data: fullData, error: fullError } = await supabase.rpc('fn_get_boundaries_with_geometry', {
        ids_json: JSON.stringify(ids)
      });
      
      if (fullError) {
        console.error('Error fetching boundary geometries:', fullError);
        return res.status(500).json({ error: fullError.message });
      }
      
      const stateMap = new Map(deduped.map((b: any) => [b.id, b.state_fips]));
      const dedupedIds = new Set(deduped.map((b: any) => b.id));
      const resultWithGeometry = (fullData || [])
        .filter((b: any) => dedupedIds.has(b.id))
        .map((b: any) => ({
          ...b,
          state_fips: stateMap.get(b.id) || null
        }));
      
      return res.json(resultWithGeometry);
    }

    return res.json(deduped);
  } catch (err: any) {
    console.error('Error in boundaries search:', err);
    return res.status(500).json({ error: err.message });
  }
}
