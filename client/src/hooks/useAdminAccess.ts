import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import type { ChurchUserRoleRecord, CityPlatformRole } from "@shared/schema";

interface UserPlatformAccess {
  platform_id: string;
  platform_name: string;
  platform_slug: string;
  role: CityPlatformRole;
  is_active: boolean;
  can_manage_boundaries: boolean;
}

interface CityPlatformUserRecord {
  id: string;
  city_platform_id: string | null;
  user_id: string;
  role: CityPlatformRole;
  church_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AdminAccessResponse {
  isPlatformAdmin: boolean;
  isSuperAdmin: boolean;
  churchAdminChurchIds: string[];
  platformRoles: CityPlatformUserRecord[];
  churchAdminRoles: ChurchUserRoleRecord[];
  userPlatforms: UserPlatformAccess[];
}

export function useAdminAccess() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery<AdminAccessResponse>({
    queryKey: ["/api/admin/access"],
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // Keep data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnMount: false, // Don't refetch when component remounts
    refetchOnWindowFocus: false, // Don't refetch on window focus
  });

  const userPlatforms = data?.userPlatforms ?? [];

  return {
    isPlatformAdmin: data?.isPlatformAdmin ?? false,
    isSuperAdmin: data?.isSuperAdmin ?? false,
    churchAdminChurchIds: data?.churchAdminChurchIds ?? [],
    isAnyAdmin: (data?.isSuperAdmin || data?.isPlatformAdmin || (data?.churchAdminChurchIds?.length ?? 0) > 0) ?? false,
    platformRoles: data?.platformRoles ?? [],
    churchAdminRoles: data?.churchAdminRoles ?? [],
    userPlatforms,
    isLoading,
    
    // Helper: Find platform by ID or slug
    findPlatform: (platformIdOrSlug: string): UserPlatformAccess | undefined => {
      return userPlatforms.find(p => 
        p.platform_id === platformIdOrSlug || 
        p.platform_slug === platformIdOrSlug
      );
    },
    
    // Helper: Check if user can access a specific platform (by ID or slug)
    canAccessPlatform: (platformIdOrSlug: string): boolean => {
      if (data?.isSuperAdmin) return true;
      return userPlatforms.some(p => 
        p.platform_id === platformIdOrSlug || 
        p.platform_slug === platformIdOrSlug
      );
    },
    
    // Helper: Get user's role for a specific platform (by ID or slug)
    getPlatformRole: (platformIdOrSlug: string): CityPlatformRole | null => {
      if (data?.isSuperAdmin) return 'super_admin';
      const platform = userPlatforms.find(p => 
        p.platform_id === platformIdOrSlug || 
        p.platform_slug === platformIdOrSlug
      );
      return platform?.role || null;
    },
    
    // Helper: Check if user is owner of a specific platform (by ID or slug)
    isPlatformOwner: (platformIdOrSlug: string): boolean => {
      if (data?.isSuperAdmin) return true;
      const platform = userPlatforms.find(p => 
        p.platform_id === platformIdOrSlug || 
        p.platform_slug === platformIdOrSlug
      );
      return platform?.role === 'platform_owner';
    },
    
    // Helper: Check if user is admin (owner or admin) of a specific platform (by ID or slug)
    isPlatformAdminOf: (platformIdOrSlug: string): boolean => {
      if (data?.isSuperAdmin) return true;
      const platform = userPlatforms.find(p => 
        p.platform_id === platformIdOrSlug || 
        p.platform_slug === platformIdOrSlug
      );
      return platform?.role === 'platform_owner' || platform?.role === 'platform_admin';
    },
  };
}

export function useRequireAdmin() {
  const { isAnyAdmin, isLoading } = useAdminAccess();
  return { isAnyAdmin, isLoading };
}

export function useRequirePlatformAdmin() {
  const { isPlatformAdmin, isLoading } = useAdminAccess();
  return { isPlatformAdmin, isLoading };
}

export function usePlatformAccess(platformIdOrSlug: string | undefined) {
  const { isSuperAdmin, userPlatforms, isLoading } = useAdminAccess();
  
  // Find the platform by either UUID or slug
  const matchedPlatform = platformIdOrSlug 
    ? userPlatforms.find(p => 
        p.platform_id === platformIdOrSlug || 
        p.platform_slug === platformIdOrSlug
      )
    : undefined;
  
  // Super admins always have access
  const hasAccess = isSuperAdmin || !!matchedPlatform;
  const role = isSuperAdmin ? 'super_admin' : (matchedPlatform?.role || null);
  const isAdmin = isSuperAdmin || 
    matchedPlatform?.role === 'platform_owner' || 
    matchedPlatform?.role === 'platform_admin';
  
  // Boundary management permission: super admins always have it, 
  // otherwise check the specific permission flag
  const canManageBoundaries = isSuperAdmin || (matchedPlatform?.can_manage_boundaries ?? false);
  
  return {
    hasAccess,
    role,
    isAdmin,
    isSuperAdmin,
    canManageBoundaries,
    isLoading,
  };
}
