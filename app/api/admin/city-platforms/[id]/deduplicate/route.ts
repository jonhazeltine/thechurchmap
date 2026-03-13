import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";
import wkx from "wkx";

const STREET_SUFFIX_MAP: Record<string, string> = {
  'street': 'st',
  'avenue': 'ave',
  'drive': 'dr',
  'road': 'rd',
  'lane': 'ln',
  'court': 'ct',
  'circle': 'cir',
  'boulevard': 'blvd',
  'highway': 'hwy',
  'place': 'pl',
  'way': 'way',
  'trail': 'trl',
  'parkway': 'pkwy',
  'terrace': 'ter',
  'northeast': 'ne',
  'northwest': 'nw',
  'southeast': 'se',
  'southwest': 'sw',
  'north': 'n',
  'south': 's',
  'east': 'e',
  'west': 'w',
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

function calculateSimilarity(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  s1 = s1.toLowerCase().trim();
  s2 = s2.toLowerCase().trim();
  if (s1 === s2) return 1;
  
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

function parseLocationToCoords(location: any): { lat: number; lng: number } | null {
  if (!location) return null;
  
  const locStr = typeof location === 'string' ? location : String(location);
  
  const wktMatch = locStr.match(/POINT\(([^ ]+) ([^)]+)\)/);
  if (wktMatch) {
    return {
      lng: parseFloat(wktMatch[1]),
      lat: parseFloat(wktMatch[2]),
    };
  }
  
  if (/^[0-9A-Fa-f]+$/.test(locStr) && locStr.length >= 34) {
    try {
      const buffer = Buffer.from(locStr, 'hex');
      const geom = wkx.Geometry.parse(buffer) as any;
      if (geom && typeof geom.x === 'number' && typeof geom.y === 'number') {
        return {
          lng: geom.x,
          lat: geom.y,
        };
      }
    } catch (e: any) {
    }
  }
  
  return null;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

type ConfidenceTier = 'exact' | 'likely' | 'review';

interface ConfidenceResult {
  confidenceScore: number;
  confidenceTier: ConfidenceTier;
  matchReason: string;
}

function calculateConfidenceTier(
  addressSimilarity: number,
  nameSimilarity: number,
  distance: number | undefined,
  matchType: 'exact_address' | 'similar_address' | 'proximity'
): ConfidenceResult {
  let score = 0;
  let matchReason = '';

  if (matchType === 'exact_address' && addressSimilarity >= 0.95 && nameSimilarity >= 0.9) {
    score = 95 + (addressSimilarity * 5);
    matchReason = 'Exact address match with matching name';
  } else if (matchType === 'exact_address' && addressSimilarity >= 0.95) {
    score = 90 + (nameSimilarity * 10);
    matchReason = 'Exact address match';
  } else if (addressSimilarity >= 0.85) {
    score = 70 + (addressSimilarity * 20);
    matchReason = `High address similarity (${Math.round(addressSimilarity * 100)}%)`;
  } else if (distance !== undefined && distance <= 50 && nameSimilarity >= 0.7) {
    score = 75 + (nameSimilarity * 15) - (distance / 10);
    matchReason = `Same location (${Math.round(distance)}m apart), similar name`;
  } else if (distance !== undefined && distance <= 100 && nameSimilarity >= 0.6) {
    score = 50 + (nameSimilarity * 30) - (distance / 5);
    matchReason = `Nearby (${Math.round(distance)}m), similar name (${Math.round(nameSimilarity * 100)}%)`;
  } else {
    score = Math.max(30, addressSimilarity * 50 + nameSimilarity * 20);
    matchReason = 'Needs manual review';
  }

  score = Math.min(100, Math.max(0, score));

  let tier: ConfidenceTier;
  if (score >= 90) {
    tier = 'exact';
  } else if (score >= 70) {
    tier = 'likely';
  } else {
    tier = 'review';
  }

  return {
    confidenceScore: Math.round(score),
    confidenceTier: tier,
    matchReason,
  };
}

async function checkPlatformAccess(
  adminClient: ReturnType<typeof supabaseServer>,
  userId: string,
  platformId: string,
  userMetadata: any
): Promise<{ hasAccess: boolean; isSuperAdmin: boolean }> {
  const isSuperAdmin = userMetadata?.super_admin === true;
  
  if (isSuperAdmin) {
    return { hasAccess: true, isSuperAdmin: true };
  }

  const { data: userRole } = await adminClient
    .from('city_platform_users')
    .select('role')
    .eq('city_platform_id', platformId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('role', ['platform_owner', 'platform_admin'])
    .single();

  return { hasAccess: !!userRole, isSuperAdmin: false };
}

async function resolvePlatformId(
  adminClient: ReturnType<typeof supabaseServer>,
  platformIdOrSlug: string
): Promise<{ id: string; name: string } | null> {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  if (uuidRegex.test(platformIdOrSlug)) {
    const { data } = await adminClient
      .from('city_platforms')
      .select('id, name')
      .eq('id', platformIdOrSlug)
      .single();
    return data;
  }
  
  const { data } = await adminClient
    .from('city_platforms')
    .select('id, name')
    .eq('slug', platformIdOrSlug)
    .single();
  return data;
}

interface DuplicatePair {
  osmChurch: {
    id: string;
    name: string;
    address: string;
    source: string;
    status: string;
    platformChurchId: string;
  };
  googleChurch: {
    id: string;
    name: string;
    address: string;
    source: string;
    status: string;
  };
  matchType: 'exact_address' | 'similar_address' | 'proximity';
  addressSimilarity: number;
  nameSimilarity: number;
  distance?: number;
  confidenceScore: number;
  confidenceTier: ConfidenceTier;
  matchReason: string;
}

interface FindDuplicatesResult {
  duplicates: DuplicatePair[];
  summary: {
    totalOsmChurches: number;
    totalGoogleChurches: number;
    duplicatesFound: number;
    exactAddressMatches: number;
    similarAddressMatches: number;
    proximityMatches: number;
    tierCounts: { exact: number; likely: number; review: number };
  };
}

async function findDuplicates(
  adminClient: ReturnType<typeof supabaseServer>,
  platformId: string
): Promise<FindDuplicatesResult> {
  const { data: platformChurches, error: churchError } = await adminClient
    .from('city_platform_churches')
    .select(`
      id,
      status,
      church_id,
      churches:church_id (
        id,
        name,
        address,
        source,
        location
      )
    `)
    .eq('city_platform_id', platformId);

  if (churchError) {
    console.error('Error fetching platform churches:', churchError);
    throw new Error('Failed to fetch churches');
  }

  const osmChurches: Array<{
    id: string;
    name: string;
    address: string;
    addressNorm: string;
    source: string;
    status: string;
    platformChurchId: string;
    lat?: number;
    lng?: number;
  }> = [];
  
  const googleChurches: Array<{
    id: string;
    name: string;
    address: string;
    addressNorm: string;
    source: string;
    status: string;
    lat?: number;
    lng?: number;
  }> = [];

  for (const pc of platformChurches || []) {
    const church = pc.churches as any;
    if (!church) continue;

    const coords = parseLocationToCoords(church.location);
    const entry = {
      id: church.id,
      name: church.name || '',
      address: church.address || '',
      addressNorm: normalizeAddress(church.address),
      source: church.source || '',
      status: pc.status,
      platformChurchId: pc.id,
      lat: coords?.lat,
      lng: coords?.lng,
    };

    if (church.source?.startsWith('osm')) {
      osmChurches.push(entry);
    } else if (church.source === 'google_places') {
      googleChurches.push({ ...entry, platformChurchId: undefined } as any);
    }
  }

  const duplicates: DuplicatePair[] = [];

  for (const osm of osmChurches) {
    
    let foundMatch = false;

    for (const google of googleChurches) {
      if (foundMatch) break;

      const nameSimilarity = calculateSimilarity(osm.name, google.name);
      
      if (osm.addressNorm && google.addressNorm) {
        const addressSimilarity = calculateSimilarity(osm.addressNorm, google.addressNorm);
        
        if (addressSimilarity >= 0.85) {
          const matchType = addressSimilarity >= 0.95 ? 'exact_address' : 'similar_address';
          const confidence = calculateConfidenceTier(addressSimilarity, nameSimilarity, undefined, matchType);
          
          duplicates.push({
            osmChurch: {
              id: osm.id,
              name: osm.name,
              address: osm.address,
              source: osm.source,
              status: osm.status,
              platformChurchId: osm.platformChurchId,
            },
            googleChurch: {
              id: google.id,
              name: google.name,
              address: google.address,
              source: google.source,
              status: google.status,
            },
            matchType,
            addressSimilarity,
            nameSimilarity,
            ...confidence,
          });
          foundMatch = true;
          continue;
        }
      }

      if (osm.lat && osm.lng && google.lat && google.lng) {
        const distance = haversineDistance(osm.lat, osm.lng, google.lat, google.lng);
        if (distance <= 100) {
          if (nameSimilarity >= 0.6) {
            const addressSimilarity = osm.addressNorm && google.addressNorm 
              ? calculateSimilarity(osm.addressNorm, google.addressNorm) 
              : 0;
            const confidence = calculateConfidenceTier(addressSimilarity, nameSimilarity, distance, 'proximity');
            
            duplicates.push({
              osmChurch: {
                id: osm.id,
                name: osm.name,
                address: osm.address,
                source: osm.source,
                status: osm.status,
                platformChurchId: osm.platformChurchId,
              },
              googleChurch: {
                id: google.id,
                name: google.name,
                address: google.address,
                source: google.source,
                status: google.status,
              },
              matchType: 'proximity',
              addressSimilarity,
              nameSimilarity,
              distance,
              ...confidence,
            });
            foundMatch = true;
          }
        }
      }
    }
  }

  const tierCounts = {
    exact: duplicates.filter(d => d.confidenceTier === 'exact').length,
    likely: duplicates.filter(d => d.confidenceTier === 'likely').length,
    review: duplicates.filter(d => d.confidenceTier === 'review').length,
  };

  return {
    duplicates,
    summary: {
      totalOsmChurches: osmChurches.length,
      totalGoogleChurches: googleChurches.length,
      duplicatesFound: duplicates.length,
      exactAddressMatches: duplicates.filter(d => d.matchType === 'exact_address').length,
      similarAddressMatches: duplicates.filter(d => d.matchType === 'similar_address').length,
      proximityMatches: duplicates.filter(d => d.matchType === 'proximity').length,
      tierCounts,
    },
  };
}

export async function GET(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id: platformIdOrSlug } = req.params;
    const platform = await resolvePlatformId(adminClient, platformIdOrSlug);
    if (!platform) {
      return res.status(404).json({ error: 'Platform not found' });
    }
    const platformId = platform.id;

    const { hasAccess } = await checkPlatformAccess(adminClient, user.id, platformId, user.user_metadata);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await findDuplicates(adminClient, platformId);
    return res.json(result);
  } catch (error: any) {
    console.error('Error finding duplicates:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export async function POST(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id: platformIdOrSlug } = req.params;
    const { action, platformChurchIds, tier } = req.body;

    const platform = await resolvePlatformId(adminClient, platformIdOrSlug);
    if (!platform) {
      return res.status(404).json({ error: 'Platform not found' });
    }
    const platformId = platform.id;

    const { hasAccess } = await checkPlatformAccess(adminClient, user.id, platformId, user.user_metadata);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (action === 'preview') {
      const result = await findDuplicates(adminClient, platformId);
      
      let filteredDuplicates = result.duplicates;
      if (tier && tier !== 'all') {
        filteredDuplicates = filteredDuplicates.filter(d => d.confidenceTier === tier);
      }

      const sample = filteredDuplicates.slice(0, 5);
      const allPlatformChurchIds = filteredDuplicates.map(d => d.osmChurch.platformChurchId);

      return res.json({
        action: 'preview',
        tier: tier || 'all',
        count: filteredDuplicates.length,
        sample,
        platformChurchIds: allPlatformChurchIds,
      });
    }

    if (action === 'bulk-hide') {
      if (!platformChurchIds || !Array.isArray(platformChurchIds) || platformChurchIds.length === 0) {
        return res.status(400).json({ error: 'No churches specified for hiding' });
      }

      const { error: updateError } = await adminClient
        .from('city_platform_churches')
        .update({ 
          status: 'hidden',
          updated_at: new Date().toISOString()
        })
        .eq('city_platform_id', platformId)
        .in('id', platformChurchIds);

      if (updateError) {
        console.error('Error hiding churches:', updateError);
        return res.status(500).json({ error: 'Failed to hide churches' });
      }

      return res.json({
        success: true,
        message: `${platformChurchIds.length} duplicate(s) hidden from platform.`,
        processedCount: platformChurchIds.length,
      });
    }

    if (action === 'bulk-dismiss') {
      if (!platformChurchIds || !Array.isArray(platformChurchIds) || platformChurchIds.length === 0) {
        return res.status(400).json({ error: 'No churches specified for dismissing' });
      }

      const { error: updateError } = await adminClient
        .from('city_platform_churches')
        .update({ 
          duplicate_dismissed: true,
          updated_at: new Date().toISOString()
        })
        .eq('city_platform_id', platformId)
        .in('id', platformChurchIds);

      if (updateError) {
        console.error('Error dismissing duplicates:', updateError);
        return res.status(500).json({ error: 'Failed to dismiss duplicates' });
      }

      return res.json({
        success: true,
        message: `${platformChurchIds.length} church(es) marked as not duplicates.`,
        processedCount: platformChurchIds.length,
      });
    }

    if (action === 'hide' || action === 'remove') {
      if (!platformChurchIds || !Array.isArray(platformChurchIds) || platformChurchIds.length === 0) {
        return res.status(400).json({ error: 'No churches specified for deduplication' });
      }

      let processedCount = 0;

      if (action === 'hide') {
        const { error: updateError } = await adminClient
          .from('city_platform_churches')
          .update({ 
            status: 'hidden',
            updated_at: new Date().toISOString()
          })
          .eq('city_platform_id', platformId)
          .in('id', platformChurchIds);

        if (updateError) {
          console.error('Error hiding churches:', updateError);
          return res.status(500).json({ error: 'Failed to hide churches' });
        }
        processedCount = platformChurchIds.length;
      } else if (action === 'remove') {
        const { error: deleteError } = await adminClient
          .from('city_platform_churches')
          .delete()
          .eq('city_platform_id', platformId)
          .in('id', platformChurchIds);

        if (deleteError) {
          console.error('Error removing churches:', deleteError);
          return res.status(500).json({ error: 'Failed to remove churches' });
        }
        processedCount = platformChurchIds.length;
      }

      return res.json({
        success: true,
        message: `${processedCount} OSM duplicate(s) ${action === 'hide' ? 'hidden' : 'removed'} from platform.`,
        processedCount,
      });
    }

    return res.status(400).json({ error: 'Invalid action. Use "preview", "bulk-hide", "bulk-dismiss", "hide", or "remove".' });
  } catch (error: any) {
    console.error('Error processing deduplication:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
