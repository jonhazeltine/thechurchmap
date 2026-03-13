/**
 * Mapbox Static Images API service for generating map preview images
 * Used for OG images / link previews
 */

const MAPBOX_TOKEN = process.env.MAPBOX_SECRET_TOKEN || process.env.VITE_MAPBOX_TOKEN || '';

const MAP_STYLE = 'mapbox/light-v11';

interface MarkerOptions {
  lon: number;
  lat: number;
  color?: string; // hex without #
  size?: 's' | 'l'; // small or large
  label?: string; // optional label (single char or maki icon name)
}

interface StaticMapOptions {
  center: { lon: number; lat: number };
  zoom: number;
  width?: number;
  height?: number;
  markers?: MarkerOptions[];
  padding?: number; // padding in pixels
  retina?: boolean;
}

/**
 * Generate a Mapbox static map URL
 */
export function getStaticMapUrl(options: StaticMapOptions): string {
  const {
    center,
    zoom,
    width = 1200,
    height = 630,
    markers = [],
    retina = true,
  } = options;

  if (!MAPBOX_TOKEN) {
    console.warn('No Mapbox token available for static map generation');
    return '';
  }

  // Build marker overlay string
  let overlay = '';
  if (markers.length > 0) {
    const markerStrings = markers.map((m) => {
      const size = m.size || 's';
      const color = m.color || '4F46E5'; // Default to brand primary
      const label = m.label ? `-${m.label}` : '';
      return `pin-${size}${label}+${color}(${m.lon.toFixed(5)},${m.lat.toFixed(5)})`;
    });
    overlay = markerStrings.join(',') + '/';
  }

  const retinaFlag = retina ? '@2x' : '';
  
  const url = `https://api.mapbox.com/styles/v1/${MAP_STYLE}/static/${overlay}${center.lon.toFixed(5)},${center.lat.toFixed(5)},${zoom},0/${width}x${height}${retinaFlag}?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`;
  
  return url;
}

/**
 * Fetch a static map image as a buffer
 */
export async function fetchStaticMapImage(options: StaticMapOptions): Promise<Buffer | null> {
  const url = getStaticMapUrl(options);
  
  if (!url) {
    return null;
  }

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('Failed to fetch static map:', response.status, response.statusText);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error('Error fetching static map:', error);
    return null;
  }
}

/**
 * Generate static map for US overview (explore page)
 * Shows a map of the continental US
 */
export function getExploreMapUrl(showChurches: boolean = false): string {
  // Center of continental US
  const center = { lon: -98.5795, lat: 39.8283 };
  const zoom = 3.5;
  
  // If showing churches, add sample markers across major cities
  const markers: MarkerOptions[] = showChurches ? [
    { lon: -122.4194, lat: 37.7749, color: '4F46E5' }, // San Francisco
    { lon: -118.2437, lat: 34.0522, color: '4F46E5' }, // Los Angeles
    { lon: -73.9857, lat: 40.7484, color: '4F46E5' }, // New York
    { lon: -87.6298, lat: 41.8781, color: '4F46E5' }, // Chicago
    { lon: -95.3698, lat: 29.7604, color: '4F46E5' }, // Houston
    { lon: -84.3880, lat: 33.7490, color: '4F46E5' }, // Atlanta
    { lon: -80.1918, lat: 25.7617, color: '4F46E5' }, // Miami
    { lon: -104.9903, lat: 39.7392, color: '4F46E5' }, // Denver
    { lon: -122.3321, lat: 47.6062, color: '4F46E5' }, // Seattle
    { lon: -112.0740, lat: 33.4484, color: '4F46E5' }, // Phoenix
  ] : [];
  
  return getStaticMapUrl({
    center,
    zoom,
    markers,
    width: 1200,
    height: 630,
  });
}

/**
 * Generate static map for a platform
 */
export function getPlatformMapUrl(
  centerLon: number,
  centerLat: number,
  churchMarkers?: Array<{ lon: number; lat: number }>
): string {
  const markers: MarkerOptions[] = (churchMarkers || []).slice(0, 50).map(m => ({
    lon: m.lon,
    lat: m.lat,
    color: '4F46E5',
    size: 's',
  }));
  
  return getStaticMapUrl({
    center: { lon: centerLon, lat: centerLat },
    zoom: 10,
    markers,
    width: 1200,
    height: 630,
  });
}

/**
 * Generate static map for a church
 */
export function getChurchMapUrl(lon: number, lat: number): string {
  return getStaticMapUrl({
    center: { lon, lat },
    zoom: 14,
    markers: [{
      lon,
      lat,
      color: '4F46E5',
      size: 'l',
      label: 'religious-christian', // Church icon
    }],
    width: 1200,
    height: 630,
  });
}
