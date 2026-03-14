import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";
import wkx from "wkx";

function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export async function GET(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const adminClient = supabaseServer();
    
    // Determine if this is a UUID (lookup by id) or a slug (lookup by slug)
    const isIdLookup = isUUID(id);
    
    // Try to get authenticated user via Bearer token
    let userId: string | null = null;
    let isSuperAdmin = false;
    let isPlatformMember = false;
    
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const { data: { user } } = await adminClient.auth.getUser(token);
      if (user) {
        userId = user.id;
        isSuperAdmin = user.user_metadata?.super_admin === true;
      }
    }
    
    // First fetch the platform to get its actual id
    const { data: platformLookup, error: lookupError } = await adminClient
      .from('city_platforms')
      .select('id')
      .eq(isIdLookup ? 'id' : 'slug', id)
      .maybeSingle();
    
    if (lookupError || !platformLookup) {
      return res.status(404).json({ error: 'Platform not found' });
    }
    
    const platformId = platformLookup.id;
    
    // Check if user is a member of this platform
    if (userId && !isSuperAdmin) {
      const { data: membership } = await adminClient
        .from('city_platform_users')
        .select('id')
        .eq('city_platform_id', platformId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();
      isPlatformMember = !!membership;
    }
    
    // Build query - allow admins and platform members to see private/inactive platforms
    let query = adminClient
      .from('city_platforms')
      .select(`
        id,
        name,
        slug,
        description,
        logo_url,
        banner_url,
        website,
        contact_email,
        default_center_lat,
        default_center_lng,
        default_zoom,
        is_active,
        is_public,
        created_at,
        combined_geometry,
        primary_boundary:boundaries!city_platforms_primary_boundary_id_fkey(id, name, type)
      `)
      .eq('id', platformId);
    
    // Only apply public/active filters for unauthenticated users or non-members
    if (!isSuperAdmin && !isPlatformMember) {
      query = query.eq('is_active', true).eq('is_public', true);
    }
    
    const { data: platform, error: platformError } = await query.single();

    if (platformError) {
      if (platformError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Platform not found or not public' });
      }
      console.error('Error fetching platform:', platformError);
      return res.status(500).json({ error: 'Failed to fetch platform' });
    }

    // Get church count for this platform (visible/featured only)
    const { count: churchCount } = await adminClient
      .from('city_platform_churches')
      .select('id', { count: 'exact', head: true })
      .eq('city_platform_id', platformId)
      .in('status', ['visible', 'featured']);

    // Get member count for this platform
    const { count: memberCount } = await adminClient
      .from('city_platform_users')
      .select('id', { count: 'exact', head: true })
      .eq('city_platform_id', platformId)
      .eq('is_active', true);

    // Get boundary names and derive state code
    const { data: platformBoundaries } = await adminClient
      .from('city_platform_boundaries')
      .select(`
        boundary:boundaries(name, state_fips, external_id)
      `)
      .eq('city_platform_id', platformId)
      .in('role', ['primary', 'included']);

    const boundaryNames = (platformBoundaries || [])
      .map((pb: any) => pb.boundary?.name)
      .filter(Boolean);

    const STATE_FIPS_TO_ABBREV: Record<string, string> = {
      '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT',
      '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL',
      '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD',
      '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE',
      '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
      '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD',
      '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV',
      '55': 'WI', '56': 'WY',
    };
    let derivedStateCode: string | null = null;
    for (const pb of (platformBoundaries || [])) {
      const b = (pb as any).boundary;
      if (b?.state_fips && STATE_FIPS_TO_ABBREV[b.state_fips]) {
        derivedStateCode = STATE_FIPS_TO_ABBREV[b.state_fips];
        break;
      }
      if (!derivedStateCode && b?.external_id) {
        const fips = b.external_id.substring(0, 2);
        if (STATE_FIPS_TO_ABBREV[fips]) {
          derivedStateCode = STATE_FIPS_TO_ABBREV[fips];
        }
      }
    }

    // Convert combined_geometry from WKB hex string to GeoJSON
    let combinedGeometryGeoJSON = null;
    if (platform.combined_geometry && typeof platform.combined_geometry === 'string') {
      try {
        const wkbBuffer = Buffer.from(platform.combined_geometry, 'hex');
        const geometry = wkx.Geometry.parse(wkbBuffer);
        combinedGeometryGeoJSON = geometry.toGeoJSON();
      } catch (err) {
        console.error('Error converting combined_geometry to GeoJSON:', err);
      }
    }

    return res.status(200).json({
      ...platform,
      combined_geometry: combinedGeometryGeoJSON,
      church_count: churchCount || 0,
      member_count: memberCount || 0,
      boundary_names: boundaryNames,
      state_code: derivedStateCode,
    });

  } catch (error) {
    console.error('Error in platforms/:id GET:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
