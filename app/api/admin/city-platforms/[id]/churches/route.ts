import type { Request, Response } from "express";
import { supabaseServer } from "../../../../../../lib/supabaseServer";
import { z } from "zod";

const addChurchSchema = z.object({
  church_id: z.string().uuid(),
  status: z.enum(['visible', 'hidden', 'pending', 'featured']).default('visible'),
});

const updateChurchSchema = z.object({
  church_id: z.string().uuid(),
  status: z.enum(['visible', 'hidden', 'pending', 'featured']).optional(),
  remove: z.boolean().optional(),
});

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

// Helper to check if a string is a valid UUID
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Helper to parse WKB hex to coordinates
function parseWKBHexToCoords(hex: string): [number, number] | null {
  try {
    // WKB format for Point with SRID:
    // 01 = little endian
    // 01000020 = Point type with SRID flag
    // E6100000 = SRID (4326 for WGS84)
    // Then 8 bytes for longitude, 8 bytes for latitude (as IEEE 754 doubles)
    
    // Remove the header (first 18 chars = 9 bytes for endian + type + SRID)
    // For standard WKB without SRID, it's 10 chars = 5 bytes
    
    // Check if it looks like WKB hex (starts with 01 for little endian or 00 for big endian)
    if (!/^0[01][0-9a-fA-F]+$/.test(hex)) {
      return null;
    }
    
    const isLittleEndian = hex.substring(0, 2) === '01';
    
    // Determine offset based on whether SRID is present
    // With SRID: 01 + 01000020 + E6100000 = 18 chars
    // Without SRID: 01 + 01000000 = 10 chars
    const typeBytes = hex.substring(2, 10);
    const hasSRID = typeBytes.endsWith('20') || typeBytes.endsWith('00000020');
    
    let offset = hasSRID ? 18 : 10;
    
    // Extract longitude and latitude (16 hex chars each = 8 bytes each)
    const lngHex = hex.substring(offset, offset + 16);
    const latHex = hex.substring(offset + 16, offset + 32);
    
    // Convert hex to IEEE 754 double
    const hexToDouble = (hexStr: string, littleEndian: boolean): number => {
      // Reverse bytes if little endian
      let bytes = hexStr;
      if (littleEndian) {
        bytes = hexStr.match(/.{2}/g)?.reverse().join('') || hexStr;
      }
      
      // Parse as 64-bit float
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      
      for (let i = 0; i < 8; i++) {
        view.setUint8(i, parseInt(bytes.substring(i * 2, i * 2 + 2), 16));
      }
      
      return view.getFloat64(0, false); // big endian after reversal
    };
    
    const lng = hexToDouble(lngHex, isLittleEndian);
    const lat = hexToDouble(latHex, isLittleEndian);
    
    // Validate coordinates are in reasonable range
    if (isNaN(lng) || isNaN(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      return null;
    }
    
    return [lng, lat];
  } catch (e) {
    return null;
  }
}

// Helper to parse PostGIS location to GeoJSON format
function parseLocationToGeoJSON(location: any): { type: 'Point'; coordinates: [number, number] } | null {
  if (!location) return null;
  
  // If it's already in GeoJSON format
  if (typeof location === 'object' && location.coordinates && Array.isArray(location.coordinates)) {
    return { type: 'Point', coordinates: location.coordinates };
  }
  
  // If it's a string
  if (typeof location === 'string') {
    // Try WKB hex format first (most common from Supabase/PostGIS)
    if (/^0[01][0-9a-fA-F]+$/.test(location)) {
      const coords = parseWKBHexToCoords(location);
      if (coords) {
        return { type: 'Point', coordinates: coords };
      }
    }
    
    // Match POINT(lng lat) format
    const pointMatch = location.match(/POINT\s*\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
    if (pointMatch) {
      const lng = parseFloat(pointMatch[1]);
      const lat = parseFloat(pointMatch[2]);
      if (!isNaN(lng) && !isNaN(lat)) {
        return { type: 'Point', coordinates: [lng, lat] };
      }
    }
    
    // Match (lng,lat) format
    const tupleMatch = location.match(/\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/);
    if (tupleMatch) {
      const lng = parseFloat(tupleMatch[1]);
      const lat = parseFloat(tupleMatch[2]);
      if (!isNaN(lng) && !isNaN(lat)) {
        return { type: 'Point', coordinates: [lng, lat] };
      }
    }
  }
  
  return null;
}

// Helper to resolve platform ID (can be UUID or slug)
async function resolvePlatformId(
  client: ReturnType<typeof supabaseServer>,
  idOrSlug: string
): Promise<{ id: string; name: string; default_center_lat: number | null; default_center_lng: number | null } | null> {
  if (isValidUUID(idOrSlug)) {
    const { data } = await client
      .from('city_platforms')
      .select('id, name, default_center_lat, default_center_lng')
      .eq('id', idOrSlug)
      .single();
    return data;
  }
  
  // Try as slug
  const { data } = await client
    .from('city_platforms')
    .select('id, name, default_center_lat, default_center_lng')
    .eq('slug', idOrSlug)
    .single();
  return data;
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

    // Resolve platform ID (could be UUID or slug)
    const platform = await resolvePlatformId(adminClient, platformIdOrSlug);
    if (!platform) {
      return res.status(404).json({ error: 'Platform not found' });
    }
    
    const platformId = platform.id;

    const { hasAccess } = await checkPlatformAccess(
      adminClient,
      user.id,
      platformId,
      user.user_metadata
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this platform' });
    }

    const { data: churches, error: churchesError } = await adminClient
      .from('city_platform_churches')
      .select(`
        id,
        status,
        is_claimed,
        claimed_at,
        added_at,
        updated_at,
        church:churches(
          id,
          name,
          address,
          city,
          state,
          zip,
          denomination,
          profile_photo_url,
          location,
          source,
          verification_status,
          data_quality_score,
          google_match_confidence,
          google_place_id
        )
      `)
      .eq('city_platform_id', platformId)
      .order('added_at', { ascending: false });

    if (churchesError) {
      console.error('Error fetching churches:', churchesError);
      return res.status(500).json({ error: 'Failed to fetch churches' });
    }

    // Detect potential duplicates (same name, normalized)
    // Skip churches that have been marked as "not a duplicate"
    const churchList = churches || [];
    const normalizedNames = new Map<string, Array<{ id: string; name: string; address: string | null }>>();
    
    for (const item of churchList) {
      // Skip dismissed duplicates
      if (item.church?.duplicate_dismissed) continue;
      
      if (item.church?.name) {
        const normalized = item.church.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!normalizedNames.has(normalized)) {
          normalizedNames.set(normalized, []);
        }
        normalizedNames.get(normalized)!.push({
          id: item.church.id,
          name: item.church.name,
          address: item.church.address,
        });
      }
    }
    
    // Build duplicate info map - for each church, list the other churches it duplicates
    const duplicateInfo = new Map<string, Array<{ id: string; name: string; address: string | null }>>();
    for (const [, churchInfos] of normalizedNames) {
      if (churchInfos.length > 1) {
        for (const church of churchInfos) {
          // Get all OTHER churches that share the same normalized name
          const others = churchInfos.filter(c => c.id !== church.id);
          duplicateInfo.set(church.id, others);
        }
      }
    }
    
    // Transform churches to include proper GeoJSON location format
    // Debug: Log a sample of location data to understand the format
    if (churchList.length > 0 && churchList[0].church?.location) {
      console.log('Sample church location raw:', JSON.stringify(churchList[0].church.location));
      console.log('Sample church location type:', typeof churchList[0].church.location);
    }
    
    const churchesWithDuplicateFlag = churchList.map(item => {
      const parsedLocation = item.church ? parseLocationToGeoJSON(item.church.location) : null;
      if (item.church && !parsedLocation && item.church.location) {
        console.warn('Failed to parse location for church:', item.church.name, 'Raw location:', JSON.stringify(item.church.location));
      }
      const duplicateMatches = item.church ? duplicateInfo.get(item.church.id) : undefined;
      return {
        ...item,
        is_potential_duplicate: !!duplicateMatches && duplicateMatches.length > 0,
        duplicate_of: duplicateMatches || [],
        church: item.church ? {
          ...item.church,
          location: parsedLocation,
        } : null,
      };
    });

    return res.status(200).json({
      platform,
      churches: churchesWithDuplicateFlag,
    });

  } catch (error) {
    console.error('Error in GET /api/admin/city-platforms/:id/churches:', error);
    return res.status(500).json({ error: 'Internal server error' });
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

    // Resolve platform ID (could be UUID or slug)
    const platform = await resolvePlatformId(adminClient, platformIdOrSlug);
    if (!platform) {
      return res.status(404).json({ error: 'Platform not found' });
    }
    const platformId = platform.id;

    const { hasAccess } = await checkPlatformAccess(
      adminClient,
      user.id,
      platformId,
      user.user_metadata
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this platform' });
    }

    const parseResult = addChurchSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { church_id, status } = parseResult.data;

    const { data: existingLink } = await adminClient
      .from('city_platform_churches')
      .select('id')
      .eq('city_platform_id', platformId)
      .eq('church_id', church_id)
      .single();

    if (existingLink) {
      return res.status(409).json({ error: 'This church is already added to the platform' });
    }

    const { data: church, error: churchError } = await adminClient
      .from('churches')
      .select('id, name')
      .eq('id', church_id)
      .single();

    if (churchError || !church) {
      return res.status(404).json({ error: 'Church not found' });
    }

    const { data: newLink, error: insertError } = await adminClient
      .from('city_platform_churches')
      .insert({
        city_platform_id: platformId,
        church_id,
        status,
      })
      .select(`
        id,
        status,
        is_claimed,
        claimed_at,
        added_at,
        updated_at,
        church:churches(id, name, address, city, state, zip, denomination, profile_photo_url, location)
      `)
      .single();

    if (insertError) {
      console.error('Error adding church:', insertError);
      return res.status(500).json({ error: 'Failed to add church' });
    }

    // Mark church as managed by platform for tileset filtering
    await adminClient
      .from('churches')
      .update({ managed_by_platform: true })
      .eq('id', church_id);

    return res.status(201).json(newLink);

  } catch (error) {
    console.error('Error in POST /api/admin/city-platforms/:id/churches:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function PATCH(req: Request, res: Response) {
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

    // Resolve platform ID (could be UUID or slug)
    const platform = await resolvePlatformId(adminClient, platformIdOrSlug);
    if (!platform) {
      return res.status(404).json({ error: 'Platform not found' });
    }
    const platformId = platform.id;

    const { hasAccess } = await checkPlatformAccess(
      adminClient,
      user.id,
      platformId,
      user.user_metadata
    );

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this platform' });
    }

    const parseResult = updateChurchSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { church_id, status, remove } = parseResult.data;

    const { data: existingLink, error: linkError } = await adminClient
      .from('city_platform_churches')
      .select('id, status')
      .eq('city_platform_id', platformId)
      .eq('church_id', church_id)
      .single();

    if (linkError || !existingLink) {
      return res.status(404).json({ error: 'Church not found in this platform' });
    }

    if (remove) {
      const { error: deleteError } = await adminClient
        .from('city_platform_churches')
        .delete()
        .eq('id', existingLink.id);

      if (deleteError) {
        console.error('Error removing church:', deleteError);
        return res.status(500).json({ error: 'Failed to remove church' });
      }

      return res.status(200).json({ success: true, removed: true });
    }

    if (status) {
      const { data: updatedLink, error: updateError } = await adminClient
        .from('city_platform_churches')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', existingLink.id)
        .select(`
          id,
          status,
          is_claimed,
          claimed_at,
          added_at,
          updated_at,
          church:churches(id, name, address, city, state, zip, denomination, profile_photo_url, location)
        `)
        .single();

      if (updateError) {
        console.error('Error updating church status:', updateError);
        return res.status(500).json({ error: 'Failed to update church status' });
      }

      // When status is 'visible' or 'featured', also approve the church in the churches table
      // This ensures the church appears in search and on the map
      if (status === 'visible' || status === 'featured') {
        await adminClient
          .from('churches')
          .update({ approved: true })
          .eq('id', church_id);
      }

      return res.status(200).json(updatedLink);
    }

    return res.status(400).json({ error: 'No update action specified' });

  } catch (error) {
    console.error('Error in PATCH /api/admin/city-platforms/:id/churches:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
