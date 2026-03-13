import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const STATE_BOUNDS: Record<string, { minLng: number; maxLng: number; minLat: number; maxLat: number }> = {
  AL: { minLng: -88.5, maxLng: -84.9, minLat: 30.2, maxLat: 35.0 },
  AK: { minLng: -180, maxLng: -130, minLat: 51, maxLat: 72 },
  AZ: { minLng: -115, maxLng: -109, minLat: 31.3, maxLat: 37 },
  AR: { minLng: -94.6, maxLng: -89.6, minLat: 33, maxLat: 36.5 },
  CA: { minLng: -124.5, maxLng: -114, minLat: 32.5, maxLat: 42 },
  CO: { minLng: -109, maxLng: -102, minLat: 37, maxLat: 41 },
  CT: { minLng: -73.7, maxLng: -72, minLat: 41, maxLat: 42.1 },
  DE: { minLng: -75.8, maxLng: -75, minLat: 38.5, maxLat: 39.8 },
  FL: { minLng: -87.6, maxLng: -80, minLat: 24.5, maxLat: 31 },
  GA: { minLng: -85.6, maxLng: -80.8, minLat: 30.4, maxLat: 35 },
  HI: { minLng: -160, maxLng: -154.8, minLat: 18.9, maxLat: 22.2 },
  ID: { minLng: -117.2, maxLng: -111, minLat: 42, maxLat: 49 },
  IL: { minLng: -91.5, maxLng: -87.5, minLat: 37, maxLat: 42.5 },
  IN: { minLng: -88.1, maxLng: -84.8, minLat: 37.8, maxLat: 41.8 },
  IA: { minLng: -96.6, maxLng: -90.1, minLat: 40.4, maxLat: 43.5 },
  KS: { minLng: -102.1, maxLng: -94.6, minLat: 37, maxLat: 40 },
  KY: { minLng: -89.6, maxLng: -81.9, minLat: 36.5, maxLat: 39.1 },
  LA: { minLng: -94.1, maxLng: -89, minLat: 29, maxLat: 33.1 },
  ME: { minLng: -71.1, maxLng: -66.9, minLat: 43, maxLat: 47.5 },
  MD: { minLng: -79.5, maxLng: -75, minLat: 38, maxLat: 39.7 },
  MA: { minLng: -73.5, maxLng: -69.9, minLat: 41.2, maxLat: 42.9 },
  MI: { minLng: -90.4, maxLng: -82.4, minLat: 41.7, maxLat: 48.2 },
  MN: { minLng: -97.2, maxLng: -89.5, minLat: 43.5, maxLat: 49.4 },
  MS: { minLng: -91.7, maxLng: -88, minLat: 30, maxLat: 35 },
  MO: { minLng: -95.8, maxLng: -89.1, minLat: 36, maxLat: 40.6 },
  MT: { minLng: -116.1, maxLng: -104, minLat: 44.4, maxLat: 49 },
  NE: { minLng: -104.1, maxLng: -95.3, minLat: 40, maxLat: 43.1 },
  NV: { minLng: -120, maxLng: -114, minLat: 35, maxLat: 42 },
  NH: { minLng: -72.6, maxLng: -70.6, minLat: 42.7, maxLat: 45.3 },
  NJ: { minLng: -75.6, maxLng: -73.9, minLat: 38.9, maxLat: 41.4 },
  NM: { minLng: -109.1, maxLng: -103, minLat: 31.3, maxLat: 37 },
  NY: { minLng: -79.8, maxLng: -72, minLat: 40.5, maxLat: 45.1 },
  NC: { minLng: -84.3, maxLng: -75.5, minLat: 33.8, maxLat: 36.6 },
  ND: { minLng: -104.1, maxLng: -96.6, minLat: 45.9, maxLat: 49 },
  OH: { minLng: -84.8, maxLng: -80.5, minLat: 38.4, maxLat: 42 },
  OK: { minLng: -103, maxLng: -94.4, minLat: 33.6, maxLat: 37 },
  OR: { minLng: -124.6, maxLng: -116.5, minLat: 42, maxLat: 46.3 },
  PA: { minLng: -80.5, maxLng: -74.7, minLat: 39.7, maxLat: 42.3 },
  RI: { minLng: -71.9, maxLng: -71.1, minLat: 41.1, maxLat: 42.1 },
  SC: { minLng: -83.4, maxLng: -79, minLat: 32, maxLat: 35.2 },
  SD: { minLng: -104.1, maxLng: -96.4, minLat: 42.5, maxLat: 45.9 },
  TN: { minLng: -90.3, maxLng: -81.6, minLat: 35, maxLat: 36.7 },
  TX: { minLng: -106.6, maxLng: -93.5, minLat: 25.8, maxLat: 36.5 },
  UT: { minLng: -114.1, maxLng: -109, minLat: 37, maxLat: 42 },
  VT: { minLng: -73.4, maxLng: -71.5, minLat: 42.7, maxLat: 45.1 },
  VA: { minLng: -83.7, maxLng: -75.2, minLat: 36.5, maxLat: 39.5 },
  WA: { minLng: -124.8, maxLng: -116.9, minLat: 45.5, maxLat: 49 },
  WV: { minLng: -82.6, maxLng: -77.7, minLat: 37.2, maxLat: 40.6 },
  WI: { minLng: -92.9, maxLng: -86.2, minLat: 42.5, maxLat: 47 },
  WY: { minLng: -111.1, maxLng: -104, minLat: 41, maxLat: 45.1 },
  DC: { minLng: -77.1, maxLng: -77, minLat: 38.8, maxLat: 38.99 },
};

export function getStateFromCoordinates(lng: number, lat: number): string | null {
  for (const [stateCode, bounds] of Object.entries(STATE_BOUNDS)) {
    if (
      lng >= bounds.minLng &&
      lng <= bounds.maxLng &&
      lat >= bounds.minLat &&
      lat <= bounds.maxLat
    ) {
      return stateCode;
    }
  }
  return null;
}
