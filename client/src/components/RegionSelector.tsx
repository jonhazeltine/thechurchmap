import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronDown, MapPin, Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { CityPlatform } from "@shared/schema";

interface PlatformRegion {
  id: string;
  name: string;
  color: string | null;
  church_count: number;
}

interface RegionsResponse {
  regions: PlatformRegion[];
}

interface RegionSelectorProps {
  platformId: string;
  currentRegionId?: string | null;
  platform?: CityPlatform | null;
}

export function RegionSelector({ platformId, currentRegionId, platform }: RegionSelectorProps) {
  const [location, setLocation] = useLocation();
  
  const { data: regionsData, isLoading } = useQuery<RegionsResponse>({
    queryKey: [`/api/platforms/${platformId}/regions`],
    enabled: !!platformId,
  });

  const regions = regionsData?.regions || [];
  const hasRegions = regions.length > 0;

  const currentRegion = currentRegionId 
    ? regions.find(r => r.id === currentRegionId) 
    : null;

  const handleRegionSelect = (regionId: string | null) => {
    const currentParams = new URLSearchParams(window.location.search);
    
    if (regionId) {
      currentParams.set('region', regionId);
    } else {
      currentParams.delete('region');
    }
    
    currentParams.set('platform', platformId);
    
    const newUrl = `/?${currentParams.toString()}`;
    setLocation(newUrl);
  };

  // If no platform, show nothing
  if (!platform) return null;

  // Build display text: "Platform Name" or "Platform Name > Region"
  const displayText = currentRegion 
    ? `${platform.name} › ${currentRegion.name}`
    : platform.name;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 h-8 px-2 hover:bg-accent/50"
          data-testid="button-platform-region-selector"
        >
          {platform.logo_url ? (
            <Avatar className="h-5 w-5">
              <AvatarImage src={platform.logo_url} alt={platform.name} />
              <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">
                {platform.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : (
            <Globe className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium max-w-[200px] truncate" data-testid="text-platform-name">
            {displayText}
          </span>
          {hasRegions && <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />}
        </Button>
      </DropdownMenuTrigger>
      {hasRegions && (
        <DropdownMenuContent align="start" className="w-[220px]">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            Filter by Area
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => handleRegionSelect(null)}
            className={!currentRegionId ? "bg-accent" : ""}
            data-testid="menu-item-all-areas"
          >
            <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
            <span>All Areas</span>
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          {regions.map((region) => (
            <DropdownMenuItem
              key={region.id}
              onClick={() => handleRegionSelect(region.id)}
              className={currentRegionId === region.id ? "bg-accent" : ""}
              data-testid={`menu-item-region-${region.id}`}
            >
              <div
                className="h-3 w-3 rounded-full mr-2 shrink-0"
                style={{ backgroundColor: region.color || '#6b7280' }}
              />
              <span className="truncate flex-1">{region.name}</span>
              <span className="text-xs text-muted-foreground ml-2">{region.church_count}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}
