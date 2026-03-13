// TIGERweb API Service for fetching census tract geometries
// https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/
// Layer 0 = Census Tracts, Layer 8 = Block Groups

const TIGERWEB_TRACTS_URL = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/0/query';

interface TractFeature {
  type: 'Feature';
  properties: {
    GEOID: string;
    NAME: string;
    STATE: string;
    COUNTY: string;
    TRACT: string;
    ALAND: number;
    AWATER: number;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][];
  };
}

interface TigerWebResponse {
  type: 'FeatureCollection';
  features: TractFeature[];
}

export async function fetchTractGeometry(tractFips: string): Promise<TractFeature | null> {
  try {
    const params = new URLSearchParams({
      where: `GEOID='${tractFips}'`,
      outFields: '*',
      returnGeometry: 'true',
      f: 'geojson'
    });

    const response = await fetch(`${TIGERWEB_TRACTS_URL}?${params}`);
    if (!response.ok) {
      console.error(`TIGERweb API error: ${response.status}`);
      return null;
    }

    const data: TigerWebResponse = await response.json();
    return data.features?.[0] || null;
  } catch (error) {
    console.error('Error fetching tract geometry:', error);
    return null;
  }
}

export async function fetchTractsForState(stateFips: string): Promise<TractFeature[]> {
  try {
    const params = new URLSearchParams({
      where: `STATE='${stateFips}'`,
      outFields: 'GEOID,NAME,STATE,COUNTY,TRACT',
      returnGeometry: 'true',
      f: 'geojson',
      resultRecordCount: '2000' // Max per request
    });

    const response = await fetch(`${TIGERWEB_TRACTS_URL}?${params}`);
    if (!response.ok) {
      console.error(`TIGERweb API error: ${response.status}`);
      return [];
    }

    const data: TigerWebResponse = await response.json();
    return data.features || [];
  } catch (error) {
    console.error('Error fetching state tracts:', error);
    return [];
  }
}

export async function fetchTractsForCounty(stateFips: string, countyFips: string): Promise<TractFeature[]> {
  try {
    const params = new URLSearchParams({
      where: `STATE='${stateFips}' AND COUNTY='${countyFips}'`,
      outFields: 'GEOID,NAME,STATE,COUNTY,TRACT',
      returnGeometry: 'true',
      f: 'geojson',
      resultRecordCount: '1000'
    });

    const response = await fetch(`${TIGERWEB_TRACTS_URL}?${params}`);
    if (!response.ok) {
      console.error(`TIGERweb API error: ${response.status}`);
      return [];
    }

    const data: TigerWebResponse = await response.json();
    return data.features || [];
  } catch (error) {
    console.error('Error fetching county tracts:', error);
    return [];
  }
}

async function fetchTractFromCensusGeocoder(lng: number, lat: number): Promise<TractFeature | null> {
  try {
    const url = `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lng}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&layers=10&format=json`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[Census Geocoder] API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    const blockGroups = data?.result?.geographies?.['Census Block Groups'];
    
    if (!blockGroups || blockGroups.length === 0) {
      console.log('[Census Geocoder] No block group found for coordinates');
      return null;
    }
    
    const bg = blockGroups[0];
    const tractGeoid = `${bg.STATE}${bg.COUNTY}${bg.TRACT}`;
    
    console.log(`[Census Geocoder] Found tract: ${tractGeoid}`);
    
    return {
      type: 'Feature',
      properties: {
        GEOID: tractGeoid,
        NAME: bg.NAME || `Tract ${bg.TRACT}`,
        STATE: bg.STATE,
        COUNTY: bg.COUNTY,
        TRACT: bg.TRACT,
        ALAND: parseInt(bg.AREALAND) || 0,
        AWATER: parseInt(bg.AREAWATER) || 0
      },
      geometry: {
        type: 'Polygon',
        coordinates: []
      }
    };
  } catch (error) {
    console.error('[Census Geocoder] Error:', error);
    return null;
  }
}

export interface FetchTractsByBboxOptions {
  platformCenter?: { lng: number; lat: number };
}

export async function fetchTractsByBbox(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
  options?: FetchTractsByBboxOptions
): Promise<TractFeature[]> {
  try {
    const params = new URLSearchParams({
      geometry: `${minLng},${minLat},${maxLng},${maxLat}`,
      geometryType: 'esriGeometryEnvelope',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: 'GEOID,NAME,STATE,COUNTY,TRACT',
      returnGeometry: 'true',
      f: 'geojson',
      resultRecordCount: '500'
    });

    const url = `${TIGERWEB_TRACTS_URL}?${params}`;
    console.log('[TIGERweb] Fetching tracts for bbox:', `${minLng},${minLat},${maxLng},${maxLat}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error(`[TIGERweb] API error: ${response.status} ${response.statusText}`);
      return await fallbackToCensusGeocoder(minLng, minLat, maxLng, maxLat, options?.platformCenter);
    }

    const data = await response.json();
    
    if (data.error) {
      console.error('[TIGERweb] API returned error:', data.error);
      return await fallbackToCensusGeocoder(minLng, minLat, maxLng, maxLat, options?.platformCenter);
    }
    
    if (!data.features || data.features.length === 0) {
      console.log('[TIGERweb] No tracts found, trying Census Geocoder fallback');
      return await fallbackToCensusGeocoder(minLng, minLat, maxLng, maxLat, options?.platformCenter);
    }
    
    console.log(`[TIGERweb] Got ${data.features.length} tracts`);
    return data.features;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error('[TIGERweb] Request timed out, trying fallback');
    } else {
      console.error('[TIGERweb] Error:', error);
    }
    return await fallbackToCensusGeocoder(minLng, minLat, maxLng, maxLat, options?.platformCenter);
  }
}

async function fallbackToCensusGeocoder(
  minLng: number, 
  minLat: number, 
  maxLng: number, 
  maxLat: number,
  platformCenter?: { lng: number; lat: number }
): Promise<TractFeature[]> {
  console.log('[TIGERweb] Using Census Geocoder fallback');
  
  // Use platform center if provided, otherwise use bbox center
  // This prevents using (0,0) as the center for world bbox requests
  let centerLng: number;
  let centerLat: number;
  
  if (platformCenter) {
    centerLng = platformCenter.lng;
    centerLat = platformCenter.lat;
    console.log(`[Census Geocoder] Using platform center: (${centerLng}, ${centerLat})`);
  } else {
    centerLng = (minLng + maxLng) / 2;
    centerLat = (minLat + maxLat) / 2;
  }
  
  // Skip fallback if center is clearly invalid (0,0 = Atlantic Ocean)
  if (Math.abs(centerLng) < 1 && Math.abs(centerLat) < 1) {
    console.log('[Census Geocoder] Skipping fallback - center point (0,0) is in the Atlantic Ocean');
    return [];
  }
  
  const tract = await fetchTractFromCensusGeocoder(centerLng, centerLat);
  return tract ? [tract] : [];
}
