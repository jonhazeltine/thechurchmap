import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";

// Normalize boundary/city names for comparison by stripping common civic suffixes
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+(city|township|charter township|village|borough|town|municipality|cdp|census designated place)$/i, '')
    .trim();
}

export async function GET(req: Request, res: Response) {
  try {
    const { lng, lat, types, city } = req.query;

    if (!lng || !lat) {
      res.status(400).json({ 
        error: "Missing required parameters: lng and lat" 
      });
      return;
    }

    const longitude = parseFloat(lng as string);
    const latitude = parseFloat(lat as string);

    if (isNaN(longitude) || isNaN(latitude)) {
      res.status(400).json({ 
        error: "Invalid coordinates: lng and lat must be valid numbers" 
      });
      return;
    }

    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      res.status(400).json({ 
        error: "Coordinates out of range: lng must be -180 to 180, lat must be -90 to 90" 
      });
      return;
    }

    const supabase = supabaseServer();
    const startTime = Date.now();
    
    console.log(`[Boundary Detection] Looking for boundaries at lng=${longitude}, lat=${latitude}`);

    // Use PostGIS ST_Intersects for fast spatial query with GIST index
    // This is MUCH faster than downloading all boundaries and checking client-side
    const typeFilter = types ? (types as string).split(',') : null;
    
    // Build the query using PostGIS ST_Intersects
    // The geometry column should have a GIST index for fast spatial queries
    const { data: matchingBoundaries, error } = await supabase.rpc('fn_boundaries_containing_point', {
      p_lng: longitude,
      p_lat: latitude,
      p_types: typeFilter
    });

    if (error) {
      // If RPC doesn't exist, fall back to raw query approach
      console.log('[Boundary Detection] RPC not found, trying raw query approach:', error.message);
      
      // Use a simpler approach - query boundaries with ST_Intersects via raw SQL
      const { data: rawBoundaries, error: rawError } = await supabase
        .from('boundaries')
        .select('id, name, type')
        .or(typeFilter ? typeFilter.map(t => `type.eq.${t}`).join(',') : 'type.neq.null');

      if (rawError) {
        console.error('[Boundary Detection] Query error:', rawError);
        res.status(500).json({ error: "Database query failed" });
        return;
      }

      // If we have a city name hint, try to match by name first (fast path)
      if (city && rawBoundaries) {
        const cityName = (city as string).toLowerCase();
        const cityMatch = rawBoundaries.find(b => 
          b.name.toLowerCase() === cityName || 
          b.name.toLowerCase().includes(cityName)
        );
        
        if (cityMatch) {
          const elapsed = Date.now() - startTime;
          console.log(`[Boundary Detection] Found city match by name: ${cityMatch.name} in ${elapsed}ms`);
          
          res.json({
            boundaries: [{
              id: cityMatch.id,
              name: cityMatch.name,
              type: cityMatch.type,
              geom_type: 'Polygon'
            }],
            coordinates: { lng: longitude, lat: latitude },
            id: cityMatch.id,
            name: cityMatch.name,
            type: cityMatch.type,
            geom_type: 'Polygon'
          });
          return;
        }
      }

      // No match found
      res.status(404).json({ 
        error: `No boundary found for this location`,
        suggestion: "This location may be outside our mapped boundary areas. You can still add the church.",
        coordinates: { lng: longitude, lat: latitude }
      });
      return;
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Boundary Detection] Found ${matchingBoundaries?.length || 0} boundaries in ${elapsed}ms`);

    if (!matchingBoundaries || matchingBoundaries.length === 0) {
      // If we have a city name hint, try to find by name as fallback
      if (city) {
        const cityName = (city as string).toLowerCase();
        const { data: cityMatch } = await supabase
          .from('boundaries')
          .select('id, name, type')
          .ilike('name', `%${cityName}%`)
          .limit(1)
          .single();

        if (cityMatch) {
          console.log(`[Boundary Detection] Found city match by name fallback: ${cityMatch.name}`);
          res.json({
            boundaries: [{
              id: cityMatch.id,
              name: cityMatch.name,
              type: cityMatch.type,
              geom_type: 'Polygon'
            }],
            coordinates: { lng: longitude, lat: latitude },
            id: cityMatch.id,
            name: cityMatch.name,
            type: cityMatch.type,
            geom_type: 'Polygon'
          });
          return;
        }
      }

      res.status(404).json({ 
        error: `No boundary found for this location`,
        suggestion: "This location may be outside our mapped boundary areas. You can still add the church.",
        coordinates: { lng: longitude, lat: latitude }
      });
      return;
    }

    // Prioritization strategy:
    // 1. Filter to boundaries whose normalized name matches the Mapbox city name
    // 2. Pick the smallest (first in area-ordered list) from those matches
    // 3. Only fall back to non-matching boundaries if no matches found
    let preferredBoundary = matchingBoundaries[0]; // Default to smallest (first in list)
    
    if (city && matchingBoundaries.length > 0) {
      const normalizedMapboxCity = normalizeName(city as string);
      console.log(`[Boundary Detection] Mapbox city: "${city}", normalized: "${normalizedMapboxCity}"`);
      
      // Filter to only boundaries that match the normalized Mapbox city name
      const matchingByName = matchingBoundaries.filter((b: any) => {
        const normalizedBoundary = normalizeName(b.name);
        return normalizedBoundary === normalizedMapboxCity;
      });
      
      if (matchingByName.length > 0) {
        // Pick the first (smallest) from the Mapbox-matched boundaries
        preferredBoundary = matchingByName[0];
        console.log(`[Boundary Detection] Found ${matchingByName.length} boundary(ies) matching Mapbox city "${normalizedMapboxCity}", using smallest: ${preferredBoundary.name}`);
      } else {
        // No exact match - log all boundary names for debugging
        const allNames = matchingBoundaries.map((b: any) => `${b.name} (normalized: ${normalizeName(b.name)})`).join(', ');
        console.log(`[Boundary Detection] No boundaries match Mapbox city "${normalizedMapboxCity}". Available: ${allNames}. Falling back to smallest: ${preferredBoundary.name}`);
      }
    }

    // Return ALL matching boundaries, but use the preferred one for backwards compatibility
    res.json({
      boundaries: matchingBoundaries,
      coordinates: { lng: longitude, lat: latitude },
      // Use the preferred boundary (Mapbox-matched or smallest) for backwards compatibility
      ...preferredBoundary
    });

  } catch (error: any) {
    console.error('[Boundary Detection] Error:', error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
}
