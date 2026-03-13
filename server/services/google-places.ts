interface GooglePlacesChurch {
  place_id: string;
  name: string;
  formatted_address?: string;
  vicinity?: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  types?: string[];
  rating?: number;
  user_ratings_total?: number;
  opening_hours?: {
    open_now?: boolean;
  };
  website?: string;
  formatted_phone_number?: string;
}

interface NearbySearchResponse {
  results: GooglePlacesChurch[];
  next_page_token?: string;
  status: string;
  error_message?: string;
}

interface PlaceDetailsResponse {
  result: {
    website?: string;
    formatted_phone_number?: string;
    opening_hours?: any;
  };
  status: string;
}

export interface ChurchFromGoogle {
  google_place_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude: number;
  longitude: number;
  rating?: number;
  rating_count?: number;
  website?: string;
  phone?: string;
}

function parseAddress(formattedAddress: string | undefined): { city: string; state: string; zip: string } {
  if (!formattedAddress) {
    return { city: '', state: '', zip: '' };
  }
  
  const parts = formattedAddress.split(',').map(p => p.trim());
  let city = '';
  let state = '';
  let zip = '';
  
  if (parts.length >= 2) {
    city = parts[parts.length - 3] || parts[0] || '';
    const stateZip = parts[parts.length - 2] || '';
    const stateZipMatch = stateZip.match(/([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/);
    if (stateZipMatch) {
      state = stateZipMatch[1] || '';
      zip = stateZipMatch[2] || '';
    } else {
      state = stateZip;
    }
  }
  
  return { city, state, zip };
}

export async function searchChurchesNearby(
  lat: number,
  lng: number,
  radiusMeters: number = 5000
): Promise<ChurchFromGoogle[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_PLACES_API_KEY is not configured');
  }

  const churches: ChurchFromGoogle[] = [];
  let nextPageToken: string | undefined;
  let pageCount = 0;
  const maxPages = 3; // Google returns max 60 results (3 pages of 20)

  do {
    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    url.searchParams.set('location', `${lat},${lng}`);
    url.searchParams.set('radius', radiusMeters.toString());
    url.searchParams.set('type', 'church');
    url.searchParams.set('key', apiKey);
    
    if (nextPageToken) {
      url.searchParams.set('pagetoken', nextPageToken);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const response = await fetch(url.toString());
    const data: NearbySearchResponse = await response.json();
    
    console.log(`[Google Places] API response status: ${data.status}, results count: ${data.results?.length || 0}`);
    if (data.error_message) {
      console.log(`[Google Places] Error message: ${data.error_message}`);
    }

    if (data.status === 'REQUEST_DENIED') {
      throw new Error(`Google Places API error: ${data.error_message || 'Request denied'}`);
    }

    if (data.status === 'INVALID_REQUEST' && nextPageToken) {
      break;
    }

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.warn(`Google Places API warning: ${data.status} - ${data.error_message}`);
      break;
    }

    for (const place of data.results || []) {
      const formattedAddress = place.formatted_address || place.vicinity || '';
      const { city, state, zip } = parseAddress(formattedAddress);
      
      if (!formattedAddress) {
        console.log(`[Google Places] Warning: No address for "${place.name}" at ${place.geometry?.location?.lat}, ${place.geometry?.location?.lng}`);
      }
      
      churches.push({
        google_place_id: place.place_id,
        name: place.name,
        address: formattedAddress,
        city,
        state,
        zip,
        latitude: place.geometry.location.lat,
        longitude: place.geometry.location.lng,
        rating: place.rating,
        rating_count: place.user_ratings_total,
        website: place.website,
        phone: place.formatted_phone_number,
      });
    }

    nextPageToken = data.next_page_token;
    pageCount++;
  } while (nextPageToken && pageCount < maxPages);

  return churches;
}

export function generateGridPoints(
  minLat: number,
  maxLat: number,
  minLng: number,
  maxLng: number,
  radiusKm: number = 4
): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  
  const latStep = radiusKm / 111;
  const midLat = (minLat + maxLat) / 2;
  const lngStep = radiusKm / (111 * Math.cos(midLat * Math.PI / 180));
  
  for (let lat = minLat; lat <= maxLat; lat += latStep) {
    for (let lng = minLng; lng <= maxLng; lng += lngStep) {
      points.push({ lat, lng });
    }
  }
  
  return points;
}

export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }
  
  let matches = 0;
  const shorterArr = shorter.split('');
  const longerArr = longer.split('');
  
  for (let i = 0; i < shorterArr.length; i++) {
    const idx = longerArr.indexOf(shorterArr[i]);
    if (idx !== -1) {
      matches++;
      longerArr[idx] = '';
    }
  }
  
  return matches / longer.length;
}

export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface ExistingChurchForDedup {
  name: string;
  latitude: number;
  longitude: number;
  google_place_id?: string | null;
  address?: string | null;
}

export interface DeduplicationResult {
  unique: ChurchFromGoogle[];
  duplicates: Array<ChurchFromGoogle & { duplicateReason: string; matchedChurch?: string }>;
}

const STREET_SUFFIX_MAP: Record<string, string> = {
  'rd': 'road', 'road': 'road',
  'st': 'street', 'street': 'street',
  'ave': 'avenue', 'avenue': 'avenue',
  'blvd': 'boulevard', 'boulevard': 'boulevard',
  'dr': 'drive', 'drive': 'drive',
  'ln': 'lane', 'lane': 'lane',
  'ct': 'court', 'court': 'court',
  'pl': 'place', 'place': 'place',
  'cir': 'circle', 'circle': 'circle',
  'pkwy': 'parkway', 'parkway': 'parkway',
  'hwy': 'highway', 'highway': 'highway',
  'way': 'way',
  'n': 'north', 'north': 'north',
  's': 'south', 'south': 'south',
  'e': 'east', 'east': 'east',
  'w': 'west', 'west': 'west',
};

function normalizeAddress(address: string | null | undefined): string {
  if (!address) return '';
  
  let normalized = address.toLowerCase()
    .replace(/[.,#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  const words = normalized.split(' ');
  const normalizedWords = words.map(word => STREET_SUFFIX_MAP[word] || word);
  
  return normalizedWords.join(' ');
}

export function deduplicateChurches(
  newChurches: ChurchFromGoogle[],
  existingChurches: ExistingChurchForDedup[],
  nameSimilarityThreshold: number = 0.8,
  distanceThresholdMeters: number = 150
): DeduplicationResult {
  const unique: ChurchFromGoogle[] = [];
  const duplicates: Array<ChurchFromGoogle & { duplicateReason: string; matchedChurch?: string }> = [];
  const seenPlaceIds = new Set<string>();
  
  const existingByPlaceId = new Map<string, ExistingChurchForDedup>();
  for (const existing of existingChurches) {
    if (existing.google_place_id) {
      existingByPlaceId.set(existing.google_place_id, existing);
    }
  }

  for (const church of newChurches) {
    if (seenPlaceIds.has(church.google_place_id)) {
      continue;
    }
    seenPlaceIds.add(church.google_place_id);

    let isDuplicate = false;
    let duplicateReason = '';
    let matchedChurch = '';

    if (existingByPlaceId.has(church.google_place_id)) {
      isDuplicate = true;
      duplicateReason = 'google_place_id_match';
      matchedChurch = existingByPlaceId.get(church.google_place_id)!.name;
      console.log(`[Dedup] DUPLICATE by google_place_id: "${church.name}" matches "${matchedChurch}"`);
    }

    if (!isDuplicate) {
      const newAddressNorm = normalizeAddress(church.address);
      
      for (const existing of existingChurches) {
        const distance = haversineDistance(
          church.latitude,
          church.longitude,
          existing.latitude,
          existing.longitude
        );
        
        if (distance <= distanceThresholdMeters) {
          const nameSimilarity = calculateSimilarity(church.name, existing.name);
          
          if (nameSimilarity >= nameSimilarityThreshold) {
            isDuplicate = true;
            duplicateReason = `name_proximity_match (similarity: ${nameSimilarity.toFixed(2)}, distance: ${distance.toFixed(0)}m)`;
            matchedChurch = existing.name;
            console.log(`[Dedup] DUPLICATE by name+proximity: "${church.name}" matches "${existing.name}" (${nameSimilarity.toFixed(2)} similarity, ${distance.toFixed(0)}m)`);
            break;
          }
          
          if (existing.address) {
            const existingAddressNorm = normalizeAddress(existing.address);
            const addressSimilarity = calculateSimilarity(newAddressNorm, existingAddressNorm);
            
            if (addressSimilarity >= 0.85 && nameSimilarity >= 0.5) {
              isDuplicate = true;
              duplicateReason = `address_match (addr: ${addressSimilarity.toFixed(2)}, name: ${nameSimilarity.toFixed(2)})`;
              matchedChurch = existing.name;
              console.log(`[Dedup] DUPLICATE by address: "${church.name}" matches "${existing.name}" (address similarity: ${addressSimilarity.toFixed(2)})`);
              break;
            }
          }
        }
      }
    }

    if (isDuplicate) {
      duplicates.push({ ...church, duplicateReason, matchedChurch });
    } else {
      unique.push(church);
      existingChurches.push({
        name: church.name,
        latitude: church.latitude,
        longitude: church.longitude,
        google_place_id: church.google_place_id,
        address: church.address,
      });
    }
  }

  console.log(`[Dedup] Summary: ${unique.length} unique, ${duplicates.length} duplicates`);
  if (duplicates.length > 0) {
    const byReason: Record<string, number> = {};
    for (const d of duplicates) {
      const reason = d.duplicateReason.split(' ')[0];
      byReason[reason] = (byReason[reason] || 0) + 1;
    }
    console.log(`[Dedup] Duplicate reasons:`, byReason);
  }

  return { unique, duplicates };
}

export interface GooglePlaceMatch {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  confidence: number;
  phone?: string;
  website?: string;
}

export async function findGooglePlaceMatch(
  churchName: string,
  lat: number,
  lng: number,
  radiusMeters: number = 500
): Promise<GooglePlaceMatch | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn('[Google Places] GOOGLE_PLACES_API_KEY not configured');
    return null;
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
    url.searchParams.set('location', `${lat},${lng}`);
    url.searchParams.set('radius', radiusMeters.toString());
    url.searchParams.set('type', 'church');
    url.searchParams.set('key', apiKey);

    console.log(`[Google Places] Searching for churches near ${lat},${lng} (radius: ${radiusMeters}m)`);
    const response = await fetch(url.toString());
    const data: NearbySearchResponse = await response.json();

    console.log(`[Google Places] API Response: status=${data.status}, results=${data.results?.length || 0}`);
    if (data.error_message) {
      console.log(`[Google Places] Error message: ${data.error_message}`);
    }

    if (data.status !== 'OK' || !data.results?.length) {
      console.log(`[Google Places] No results found (status: ${data.status})`);
      return null;
    }

    let bestMatch: GooglePlaceMatch | null = null;
    let bestScore = 0;

    console.log(`[Google Places] Evaluating ${data.results.length} candidates for "${churchName}":`);
    for (const place of data.results) {
      const distance = haversineDistance(lat, lng, place.geometry.location.lat, place.geometry.location.lng);
      const nameSimilarity = calculateSimilarity(churchName, place.name);
      
      let distanceScore = 0;
      if (distance < 50) distanceScore = 1.0;
      else if (distance < 100) distanceScore = 0.9;
      else if (distance < 200) distanceScore = 0.7;
      else if (distance < 300) distanceScore = 0.5;
      else if (distance < 500) distanceScore = 0.3;
      
      const confidence = (nameSimilarity * 0.6) + (distanceScore * 0.4);
      
      console.log(`[Google Places]   - "${place.name}" | distance: ${Math.round(distance)}m | nameSim: ${nameSimilarity.toFixed(2)} | distScore: ${distanceScore} | confidence: ${confidence.toFixed(2)}`);
      
      if (confidence > bestScore) {
        bestScore = confidence;
        bestMatch = {
          place_id: place.place_id,
          name: place.name,
          address: place.formatted_address || place.vicinity || '',
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
          confidence: Math.round(confidence * 100) / 100,
          phone: place.formatted_phone_number,
          website: place.website,
        };
      }
    }

    if (bestMatch) {
      console.log(`[Google Places] Best match: "${bestMatch.name}" (confidence: ${bestMatch.confidence})`);
    }

    return bestMatch;
  } catch (error) {
    console.error('[Google Places] Error finding match:', error);
    return null;
  }
}

export async function getPlaceDetails(placeId: string): Promise<{
  phone?: string;
  website?: string;
  address?: string;
} | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', 'formatted_phone_number,website,formatted_address');
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString());
    const data: PlaceDetailsResponse = await response.json();

    if (data.status !== 'OK') {
      return null;
    }

    return {
      phone: data.result.formatted_phone_number,
      website: data.result.website,
      address: (data.result as any).formatted_address,
    };
  } catch (error) {
    console.error('[Verification] Error fetching Place Details:', error);
    return null;
  }
}
