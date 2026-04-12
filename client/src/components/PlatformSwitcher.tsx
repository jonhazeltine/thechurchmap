import { Globe, Building2, Check, Crown, Shield, User, AlertCircle, MapPin, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlatformContext } from "@/contexts/PlatformContext";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useAuth } from "@/contexts/AuthContext";
import type { CityPlatformRole } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface PlatformRegion {
  id: string;
  name: string;
  color: string | null;
  church_count: number;
}

interface RegionsResponse {
  regions: PlatformRegion[];
}

interface PublicPlatform {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  is_active: boolean;
}

interface PublicPlatformsResponse {
  platforms: PublicPlatform[];
}

function getRoleBadgeConfig(role: CityPlatformRole): { label: string; variant: "default" | "secondary" | "outline"; icon: typeof Crown } {
  switch (role) {
    case 'platform_owner':
      return { label: 'Owner', variant: 'default', icon: Crown };
    case 'platform_admin':
      return { label: 'Admin', variant: 'secondary', icon: Shield };
    case 'super_admin':
      return { label: 'Super', variant: 'default', icon: Shield };
    default:
      return { label: 'Member', variant: 'outline', icon: User };
  }
}

export function PlatformSwitcher() {
  const { user } = useAuth();
  const { platformId, platform, isLoading: platformLoading, setPlatformId } = usePlatformContext();
  const { userPlatforms, isLoading: accessLoading, isSuperAdmin } = useAdminAccess();
  const [location, setLocation] = useLocation();

  // Get current region from URL
  const currentRegionId = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('region');
  }, [location]);

  // Fetch public platforms for logged-out users
  const { data: publicPlatformsData, isLoading: publicPlatformsLoading } = useQuery<PublicPlatformsResponse>({
    queryKey: ['/api/platforms'],
    enabled: !user,
  });

  // Fetch regions for current platform (public endpoint - works for all users)
  const { data: regionsData, isLoading: regionsLoading } = useQuery<RegionsResponse>({
    queryKey: [`/api/platforms/${platformId}/regions`],
    enabled: !!platformId,
  });

  const regions = regionsData?.regions || [];
  const hasRegions = regions.length > 0;
  const currentRegion = currentRegionId ? regions.find(r => r.id === currentRegionId) : null;

  const isLoading = user ? (platformLoading || accessLoading) : (platformLoading || publicPlatformsLoading);

  const handlePlatformSelect = (id: string | null) => {
    setPlatformId(id);
    
    // Check if we're in the admin panel - if so, stay on the current admin page
    const isInAdminPanel = location.startsWith('/admin');
    
    if (isInAdminPanel) {
      // For admin panel, update with query param for now
      const params = new URLSearchParams(window.location.search);
      params.delete('region');
      if (id) {
        params.set('platform', id);
      } else {
        params.delete('platform');
      }
      const basePath = location.split('?')[0];
      const newUrl = params.toString() ? `${basePath}?${params.toString()}` : basePath;
      setLocation(newUrl);
    } else {
      // For non-admin pages, navigate to platform map using path-based URL
      if (id) {
        // Get slug from platform data if available
        let slug = id;
        if (user && userPlatforms) {
          const userPlatform = userPlatforms.find(p => p.platform_id === id);
          if (userPlatform?.platform_slug) slug = userPlatform.platform_slug;
        } else if (publicPlatformsData?.platforms) {
          const publicPlatform = publicPlatformsData.platforms.find(p => p.id === id);
          if (publicPlatform?.slug) slug = publicPlatform.slug;
        }
        setLocation(`/${slug}/map`);
      } else {
        // National view - go to home
        setLocation('/');
      }
    }
    
    queryClient.invalidateQueries({ queryKey: ['/api/churches'] });
    queryClient.invalidateQueries({ queryKey: ['/api/prayers'] });
    queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/churches'] });
    queryClient.invalidateQueries({ queryKey: ['/api/admin/prayers'] });
  };

  const handleRegionSelect = (regionId: string | null) => {
    const currentParams = new URLSearchParams(window.location.search);
    
    if (regionId) {
      currentParams.set('region', regionId);
    } else {
      currentParams.delete('region');
    }
    
    if (platformId) {
      currentParams.set('platform', platformId);
    }
    
    // Check if we're in the admin panel - if so, stay on the current admin page
    const isInAdminPanel = location.startsWith('/admin');
    const basePath = isInAdminPanel ? location.split('?')[0] : '/';
    const newUrl = `${basePath}?${currentParams.toString()}`;
    setLocation(newUrl);
  };

  // NOTE: We used to prefetch /api/churches on hover for each platform in the
  // dropdown to improve perceived switch latency. That turned out to be a
  // server killer: a super-admin cursor moving through the list would fire 6+
  // parallel full /api/churches?city_platform_id=X fetches (e.g. Detroit's
  // 3,700+ churches × every other owned platform), each buffering thousands
  // of church rows + images + callings into Node's heap simultaneously. That
  // reliably OOM-killed the process on Railway. Removed intentionally — do
  // not add back without a concurrency guard AND a much smaller payload.
  // For perceived speed on switch, rely on the static platform pin GeoJSON
  // cache served from /public, not live /api/churches calls.

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-32" />
      </div>
    );
  }

  // For logged-out users, use public platforms
  const publicPlatforms = publicPlatformsData?.platforms?.filter(p => p.is_active) || [];

  // Filter platforms: show inactive only to owners/admins who can manage them
  const visiblePlatforms = user ? userPlatforms.filter(p => {
    // Active platforms are always visible
    if (p.is_active) return true;
    // Inactive platforms only visible to owners/admins (so they can manage them)
    return p.role === 'platform_owner' || p.role === 'platform_admin';
  }) : [];

  // For logged-in users without platforms and not super admin, hide the switcher
  // For logged-out users, ALWAYS show the switcher (even with 0 platforms) so they can at least see National View
  if (user && visiblePlatforms.length === 0 && !isSuperAdmin) {
    return null;
  }

  // Build display text
  let displayText = "National View";
  if (platform) {
    displayText = currentRegion 
      ? `${platform.name} › ${currentRegion.name}`
      : platform.name;
  }
  
  const hasMultiplePlatforms = visiblePlatforms.length > 1 || isSuperAdmin;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          className="gap-2 max-w-[240px] shrink-0"
          data-testid="button-platform-switcher"
        >
          {platformId ? (
            <Building2 className="h-4 w-4 shrink-0" />
          ) : (
            <Globe className="h-4 w-4 shrink-0" />
          )}
          <span className="truncate hidden sm:inline">{displayText}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {/* Regions Section - show FIRST when a platform is selected and has regions */}
        {platformId && hasRegions && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              {platform?.name ? `${platform.name} Areas` : 'Areas'}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            
            {regionsLoading ? (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <DropdownMenuItem
                  onClick={() => handleRegionSelect(null)}
                  className="flex items-center justify-between gap-2 cursor-pointer"
                  data-testid="menu-item-all-areas"
                >
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>All Areas</span>
                  </div>
                  {!currentRegionId && platformId && <Check className="h-4 w-4 text-primary" />}
                </DropdownMenuItem>
                
                {regions.map((region) => (
                  <DropdownMenuItem
                    key={region.id}
                    onClick={() => handleRegionSelect(region.id)}
                    className="flex items-center justify-between gap-2 cursor-pointer"
                    data-testid={`menu-item-region-${region.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: region.color || '#6b7280' }}
                      />
                      <span className="truncate">{region.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">{region.church_count}</span>
                      {currentRegionId === region.id && <Check className="h-4 w-4 text-primary" />}
                    </div>
                  </DropdownMenuItem>
                ))}
              </>
            )}
            
            <DropdownMenuSeparator />
          </>
        )}

        {/* Platforms Section */}
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Platforms
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <DropdownMenuItem
          onClick={() => handlePlatformSelect(null)}
          className="flex items-center justify-between gap-2 cursor-pointer"
          data-testid="menu-item-national-view"
        >
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 shrink-0" />
            <span>National View</span>
          </div>
          {!platformId && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
        
        {/* Logged-in user platforms with role badges */}
        {user && visiblePlatforms.length > 0 && (
          <>
            {visiblePlatforms.map((p) => {
              const roleConfig = getRoleBadgeConfig(p.role);
              const RoleIcon = roleConfig.icon;
              const isSelected = platformId === p.platform_id;
              const isInactive = !p.is_active;
              
              return (
                <DropdownMenuItem
                  key={p.platform_id}
                  onClick={() => handlePlatformSelect(p.platform_id)}
                  className={`flex items-center justify-between gap-2 cursor-pointer ${isInactive ? 'opacity-60' : ''}`}
                  data-testid={`menu-item-platform-${p.platform_id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-4 w-4 shrink-0" />
                    <span className="truncate">{p.platform_name}</span>
                    {isInactive && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 text-muted-foreground">
                        <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={roleConfig.variant} className="text-[10px] px-1.5 py-0">
                      <RoleIcon className="h-3 w-3 mr-1" />
                      {roleConfig.label}
                    </Badge>
                    {isSelected && <Check className="h-4 w-4 text-primary" />}
                  </div>
                </DropdownMenuItem>
              );
            })}
          </>
        )}

        {/* Logged-out user public platforms without role badges */}
        {!user && publicPlatforms.length > 0 && (
          <>
            {publicPlatforms.map((p) => {
              const isSelected = platformId === p.id;
              
              return (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => handlePlatformSelect(p.id)}
                  className="flex items-center justify-between gap-2 cursor-pointer"
                  data-testid={`menu-item-platform-${p.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-4 w-4 shrink-0" />
                    <span className="truncate">{p.name}</span>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-primary" />}
                </DropdownMenuItem>
              );
            })}
          </>
        )}
        
        {user && isSuperAdmin && visiblePlatforms.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No platform memberships. Super admin access grants full visibility.
          </div>
        )}
        
        {/* Empty state for logged-out users with no public platforms */}
        {!user && publicPlatforms.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            No city networks available yet. Explore the national view above.
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
