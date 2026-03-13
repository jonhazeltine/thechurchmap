import type { Request, Response } from "express";
import { supabaseServer } from "../../../../lib/supabaseServer";
import type { CityPlatformRole } from "@shared/schema";

// DEV BYPASS: Set to true to bypass Supabase auth when it's down
const DEV_BYPASS_AUTH = false;
const DEV_MOCK_USER_ID = "b28081ee-f57c-446b-8190-6abc44f14baa";

export async function GET(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    
    // DEV BYPASS: Return super admin access when Supabase is down
    if (DEV_BYPASS_AUTH && token === "dev-bypass-token") {
      console.log("🔓 DEV BYPASS: Granting super admin access");
      return res.status(200).json({
        isSuperAdmin: true,
        isPlatformAdmin: true,
        churchAdminChurchIds: [],
        isAnyAdmin: true,
        platformRoles: [],
        churchAdminRoles: [],
        userPlatforms: [],
      });
    }
    
    const adminClient = supabaseServer();
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check super_admin from user_metadata (legacy) and city_platform_users table
    const isSuperAdminMetadata = user.user_metadata?.super_admin === true;
    
    // Query city_platform_users for all roles
    const { data: cityPlatformRoles } = await adminClient
      .from('city_platform_users')
      .select(`
        id,
        city_platform_id,
        user_id,
        role,
        church_id,
        is_active,
        can_manage_boundaries,
        created_at,
        updated_at,
        city_platform:city_platforms(id, name, slug, is_active)
      `)
      .eq('user_id', user.id)
      .eq('is_active', true);
    
    const roles = (cityPlatformRoles || []) as any[];
    
    // Check if user is super_admin in city_platform_users
    const isSuperAdminCPU = roles.some((r) => r.role === 'super_admin');
    const isSuperAdmin = isSuperAdminMetadata || isSuperAdminCPU;
    
    // Check if user is platform owner or admin for any platform
    const platformOwnerAdminRoles = roles.filter(
      (r) => r.role === 'platform_owner' || r.role === 'platform_admin'
    );
    const isPlatformAdmin = isSuperAdmin || platformOwnerAdminRoles.length > 0;
    
    // Get platforms user can access (as owner/admin)
    // Note: city_platform comes as array from Supabase join, take first element
    const userPlatforms = roles
      .filter((r) => 
        r.city_platform_id && 
        ['platform_owner', 'platform_admin'].includes(r.role)
      )
      .map((r) => {
        // Handle Supabase join result - can be array, single object, or null
        const platformData = r.city_platform;
        const platform = Array.isArray(platformData) && platformData.length > 0 
          ? platformData[0] 
          : (platformData && typeof platformData === 'object' && !Array.isArray(platformData) 
              ? platformData 
              : null);
        return {
          platform_id: r.city_platform_id,
          platform_name: platform?.name ?? 'Unknown',
          platform_slug: platform?.slug ?? '',
          role: r.role as CityPlatformRole,
          is_active: platform?.is_active ?? false,
          can_manage_boundaries: r.can_manage_boundaries ?? false,
        };
      });
    
    // Get church admin roles from city_platform_users
    const churchAdminRolesFromCPU = roles.filter(
      (r) => r.role === 'church_admin' && r.church_id
    );
    const churchAdminChurchIds = churchAdminRolesFromCPU.map((r) => r.church_id as string);
    
    // Also check legacy church_user_roles table for backwards compatibility
    const { data: legacyChurchRoles } = await adminClient
      .from('church_user_roles')
      .select('id, church_id, role, is_approved, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('role', 'church_admin')
      .eq('is_approved', true);
    
    const legacyChurchIds = (legacyChurchRoles || []).map(r => r.church_id);
    const allChurchAdminChurchIds = Array.from(new Set([...churchAdminChurchIds, ...legacyChurchIds]));
    
    const response = {
      isSuperAdmin,
      isPlatformAdmin,
      churchAdminChurchIds: allChurchAdminChurchIds,
      isAnyAdmin: isSuperAdmin || isPlatformAdmin || allChurchAdminChurchIds.length > 0,
      platformRoles: cityPlatformRoles || [],
      churchAdminRoles: legacyChurchRoles || [],
      userPlatforms, // New: platforms user has admin access to
    };

    console.log('🔍 Admin Access Check for:', user.email);
    console.log('   user_metadata:', user.user_metadata);
    console.log('   super_admin flag:', user.user_metadata?.super_admin);
    console.log('   isSuperAdmin:', isSuperAdmin);
    console.log('   userPlatforms:', userPlatforms);
    console.log('   Response:', response);

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error in admin access check:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
