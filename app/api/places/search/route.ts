import type { Request, Response } from "express";

// State bounding boxes for US states (approximate)
const STATE_BBOXES: Record<string, { bbox: string; center: string }> = {
  AL: { bbox: "-88.5,-30.2,-84.9,35.0", center: "-86.9,32.3" },
  AK: { bbox: "-180,51,-130,72", center: "-153.4,64.2" },
  AZ: { bbox: "-115,31.3,-109,37", center: "-111.1,34.0" },
  AR: { bbox: "-94.6,33,-89.6,36.5", center: "-92.3,35.0" },
  CA: { bbox: "-124.5,32.5,-114,42", center: "-119.4,36.8" },
  CO: { bbox: "-109,37,-102,41", center: "-105.8,39.0" },
  CT: { bbox: "-73.7,41,-72,42.1", center: "-72.8,41.6" },
  DE: { bbox: "-75.8,38.5,-75,39.8", center: "-75.5,39.0" },
  FL: { bbox: "-87.6,24.5,-80,31", center: "-81.5,27.7" },
  GA: { bbox: "-85.6,30.4,-80.8,35", center: "-83.5,32.2" },
  HI: { bbox: "-160,18.9,-154.8,22.2", center: "-155.5,19.9" },
  ID: { bbox: "-117.2,42,-111,49", center: "-114.7,44.1" },
  IL: { bbox: "-91.5,37,-87.5,42.5", center: "-89.4,40.6" },
  IN: { bbox: "-88.1,37.8,-84.8,41.8", center: "-86.1,40.3" },
  IA: { bbox: "-96.6,40.4,-90.1,43.5", center: "-93.1,42.0" },
  KS: { bbox: "-102.1,37,-94.6,40", center: "-98.5,38.5" },
  KY: { bbox: "-89.6,36.5,-81.9,39.1", center: "-84.3,37.8" },
  LA: { bbox: "-94.1,29,-89,33.1", center: "-91.1,31.2" },
  ME: { bbox: "-71.1,43,-66.9,47.5", center: "-69.4,45.3" },
  MD: { bbox: "-79.5,38,-75,39.7", center: "-76.6,39.0" },
  MA: { bbox: "-73.5,41.2,-69.9,42.9", center: "-71.4,42.4" },
  MI: { bbox: "-90.4,41.7,-82.4,48.2", center: "-85.6,44.3" },
  MN: { bbox: "-97.2,43.5,-89.5,49.4", center: "-94.6,46.7" },
  MS: { bbox: "-91.7,30,-88,35", center: "-89.4,32.4" },
  MO: { bbox: "-95.8,36,-89.1,40.6", center: "-91.8,38.6" },
  MT: { bbox: "-116.1,44.4,-104,49", center: "-110.4,46.9" },
  NE: { bbox: "-104.1,40,-95.3,43.1", center: "-99.9,41.5" },
  NV: { bbox: "-120,35,-114,42", center: "-116.4,38.8" },
  NH: { bbox: "-72.6,42.7,-70.6,45.3", center: "-71.6,43.2" },
  NJ: { bbox: "-75.6,38.9,-73.9,41.4", center: "-74.4,40.1" },
  NM: { bbox: "-109.1,31.3,-103,37", center: "-105.9,34.5" },
  NY: { bbox: "-79.8,40.5,-72,45.1", center: "-75.0,43.0" },
  NC: { bbox: "-84.3,33.8,-75.5,36.6", center: "-79.0,35.6" },
  ND: { bbox: "-104.1,45.9,-96.6,49", center: "-100.5,47.5" },
  OH: { bbox: "-84.8,38.4,-80.5,42", center: "-82.9,40.4" },
  OK: { bbox: "-103,33.6,-94.4,37", center: "-97.1,35.0" },
  OR: { bbox: "-124.6,42,-116.5,46.3", center: "-120.6,43.8" },
  PA: { bbox: "-80.5,39.7,-74.7,42.3", center: "-77.2,41.2" },
  RI: { bbox: "-71.9,41.1,-71.1,42.1", center: "-71.5,41.7" },
  SC: { bbox: "-83.4,32,-79,35.2", center: "-81.2,34.0" },
  SD: { bbox: "-104.1,42.5,-96.4,45.9", center: "-100.4,43.9" },
  TN: { bbox: "-90.3,35,-81.6,36.7", center: "-86.6,35.5" },
  TX: { bbox: "-106.6,25.8,-93.5,36.5", center: "-99.9,31.0" },
  UT: { bbox: "-114.1,37,-109,42", center: "-111.1,39.3" },
  VT: { bbox: "-73.4,42.7,-71.5,45.1", center: "-72.6,44.0" },
  VA: { bbox: "-83.7,36.5,-75.2,39.5", center: "-78.2,37.4" },
  WA: { bbox: "-124.8,45.5,-116.9,49", center: "-120.7,47.4" },
  WV: { bbox: "-82.6,37.2,-77.7,40.6", center: "-80.5,38.6" },
  WI: { bbox: "-92.9,42.5,-86.2,47", center: "-89.5,44.3" },
  WY: { bbox: "-111.1,41,-104,45.1", center: "-107.3,43.0" },
  DC: { bbox: "-77.1,38.8,-77,38.99", center: "-77.0,38.9" },
};

export async function GET(req: Request, res: Response) {
  try {
    const { q, limit = "8", state, proximity: proximityParam } = req.query;
    
    if (!q || typeof q !== "string" || q.length < 2) {
      return res.status(400).json({ error: "Query must be at least 2 characters" });
    }

    const mapboxToken = process.env.MAPBOX_TOKEN;
    if (!mapboxToken) {
      console.error("MAPBOX_TOKEN not configured");
      return res.status(500).json({ error: "Mapbox not configured" });
    }

    // Determine search area based on state parameter or proximity
    let proximity = "-85.6681,42.9634"; // Default: Grand Rapids center
    let bbox = "-86.05,42.75,-85.45,43.15"; // Default: Grand Rapids metro area
    
    const stateCode = typeof state === "string" ? state.toUpperCase() : null;
    if (stateCode && STATE_BBOXES[stateCode]) {
      const stateData = STATE_BBOXES[stateCode];
      bbox = stateData.bbox;
      proximity = stateData.center;
      console.log(`[Places Search] Using state ${stateCode} bbox: ${bbox}, center: ${proximity}`);
    }
    
    // Override with explicit proximity if provided
    if (proximityParam && typeof proximityParam === "string") {
      proximity = proximityParam;
      console.log(`[Places Search] Using custom proximity: ${proximity}`);
    }
    
    const encodedQuery = encodeURIComponent(q);
    
    // Generate a session token for billing purposes
    const sessionToken = crypto.randomUUID();
    
    // Use Search Box API suggest endpoint - much better POI coverage
    const suggestUrl = `https://api.mapbox.com/search/searchbox/v1/suggest?` +
      `q=${encodedQuery}` +
      `&access_token=${mapboxToken}` +
      `&session_token=${sessionToken}` +
      `&proximity=${proximity}` +
      `&bbox=${bbox}` +
      `&country=us` +
      `&language=en` +
      `&limit=${limit}` +
      `&types=poi,address,postcode`;

    console.log(`[Places Search] Searching for: "${q}"`);
    
    const suggestResponse = await fetch(suggestUrl);
    
    if (!suggestResponse.ok) {
      const errorText = await suggestResponse.text();
      console.error("Mapbox Search Box API error:", suggestResponse.status, errorText);
      
      // Fallback to geocoding API if Search Box fails
      return await fallbackToGeocoding(req, res, q, mapboxToken, proximity, bbox, limit as string);
    }

    const suggestData = await suggestResponse.json();
    
    if (!suggestData.suggestions || suggestData.suggestions.length === 0) {
      console.log(`[Places Search] No suggestions found, trying geocoding fallback`);
      return await fallbackToGeocoding(req, res, q, mapboxToken, proximity, bbox, limit as string);
    }

    // Retrieve full details for each suggestion
    const results = await Promise.all(
      suggestData.suggestions.slice(0, parseInt(limit as string)).map(async (suggestion: any) => {
        try {
          // Get full details using retrieve endpoint
          const retrieveUrl = `https://api.mapbox.com/search/searchbox/v1/retrieve/${suggestion.mapbox_id}?` +
            `access_token=${mapboxToken}` +
            `&session_token=${sessionToken}`;
          
          const retrieveResponse = await fetch(retrieveUrl);
          
          if (retrieveResponse.ok) {
            const retrieveData = await retrieveResponse.json();
            const feature = retrieveData.features?.[0];
            
            if (feature) {
              const props = feature.properties || {};
              const context = props.context || {};
              
              return {
                id: suggestion.mapbox_id,
                name: suggestion.name || props.name || "",
                fullAddress: suggestion.full_address || props.full_address || "",
                address: props.address || extractAddressFromFullAddress(suggestion.full_address || ""),
                city: context.place?.name || "",
                state: context.region?.region_code || "",
                zip: context.postcode?.name || "",
                coordinates: feature.geometry?.coordinates as [number, number],
                type: suggestion.feature_type || "poi",
                category: props.poi_category?.join(", ") || suggestion.poi_category?.join(", ") || "",
                maki: suggestion.maki || props.maki || "",
                context: buildContext(context),
              };
            }
          }
          
          // If retrieve fails, use suggestion data directly
          return {
            id: suggestion.mapbox_id,
            name: suggestion.name || "",
            fullAddress: suggestion.full_address || "",
            address: extractAddressFromFullAddress(suggestion.full_address || ""),
            city: suggestion.context?.place?.name || "",
            state: suggestion.context?.region?.region_code || "",
            zip: suggestion.context?.postcode?.name || "",
            coordinates: null,
            type: suggestion.feature_type || "poi",
            category: suggestion.poi_category?.join(", ") || "",
            maki: suggestion.maki || "",
            context: [],
          };
        } catch (err) {
          console.error("Error retrieving place details:", err);
          return null;
        }
      })
    );

    const validResults = results.filter(r => r !== null && r.coordinates !== null);
    
    console.log(`[Places Search] Found ${validResults.length} results for: "${q}"`);

    return res.json({ results: validResults });
  } catch (error) {
    console.error("Places search error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// Fallback to the older geocoding API if Search Box API fails
async function fallbackToGeocoding(
  req: Request,
  res: Response,
  query: string,
  token: string,
  proximity: string,
  bbox: string,
  limit: string
) {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?` +
    `access_token=${token}` +
    `&types=poi,address,place,postcode` +
    `&country=us` +
    `&proximity=${proximity}` +
    `&bbox=${bbox}` +
    `&limit=${limit}`;

  const response = await fetch(url);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Mapbox Geocoding API error:", response.status, errorText);
    return res.status(response.status).json({ error: "Search failed" });
  }

  const data = await response.json();
  
  const results = (data.features || []).map((feature: any) => ({
    id: feature.id,
    name: feature.text || feature.place_name?.split(",")[0] || "",
    fullAddress: feature.place_name || "",
    address: extractAddress(feature),
    city: extractFromContext(feature.context, "place"),
    state: extractFromContext(feature.context, "region", true),
    zip: extractFromContext(feature.context, "postcode"),
    coordinates: feature.center as [number, number],
    type: feature.place_type?.[0] || "unknown",
    category: feature.properties?.category || "",
    maki: feature.properties?.maki || "",
    context: feature.context,
  }));

  return res.json({ results });
}

function extractAddressFromFullAddress(fullAddress: string): string {
  const parts = fullAddress.split(",");
  if (parts.length > 1) {
    // Usually the address is the second part after the name
    return parts[1]?.trim() || parts[0]?.trim() || "";
  }
  return fullAddress;
}

function buildContext(context: any): Array<{ id: string; text: string; short_code?: string }> {
  const result = [];
  
  if (context.place?.name) {
    result.push({ id: "place." + (context.place.mapbox_id || ""), text: context.place.name });
  }
  if (context.region?.name) {
    result.push({ 
      id: "region." + (context.region.mapbox_id || ""), 
      text: context.region.name,
      short_code: context.region.region_code ? `US-${context.region.region_code}` : undefined
    });
  }
  if (context.postcode?.name) {
    result.push({ id: "postcode." + (context.postcode.mapbox_id || ""), text: context.postcode.name });
  }
  if (context.country?.name) {
    result.push({ 
      id: "country." + (context.country.mapbox_id || ""), 
      text: context.country.name,
      short_code: context.country.country_code
    });
  }
  
  return result;
}

function extractAddress(feature: any): string {
  if (feature.properties?.address) {
    return feature.properties.address;
  }
  
  if (feature.place_type?.includes("address")) {
    return feature.place_name?.split(",")[0] || "";
  }
  
  const parts = feature.place_name?.split(",") || [];
  if (parts.length > 1) {
    return parts[1]?.trim() || "";
  }
  
  return "";
}

function extractFromContext(
  context: Array<{ id: string; text: string; short_code?: string }> | undefined,
  type: string,
  useShortCode = false
): string {
  if (!context) return "";
  
  const item = context.find(c => c.id.startsWith(`${type}.`));
  if (!item) return "";
  
  if (useShortCode && item.short_code) {
    return item.short_code.split("-").pop() || "";
  }
  
  return item.text || "";
}
