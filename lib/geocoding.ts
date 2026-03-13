// Mapbox Geocoding helper
export interface GeocodeResult {
  lng: number;
  lat: number;
  formattedAddress?: string;
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  // Use server-side token or fallback to public token
  // Note: MAPBOX_TOKEN is server-only, NEXT_PUBLIC_MAPBOX_TOKEN works but is less secure
  const mapboxToken = process.env.MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  
  if (!mapboxToken) {
    console.warn('Mapbox token not configured - geocoding disabled');
    return null;
  }

  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${mapboxToken}&limit=1`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.features || data.features.length === 0) {
      return null; // No results found
    }

    const feature = data.features[0];
    const [lng, lat] = feature.center;

    return {
      lng,
      lat,
      formattedAddress: feature.place_name,
    };
  } catch (error: any) {
    console.error('Geocoding error:', error);
    throw new Error(`Unable to geocode address: ${error.message}`);
  }
}
