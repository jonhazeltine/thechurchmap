import { useState, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MinistryAreaCard } from "./MinistryAreaCard";
import { type MinistryAreaWithCalling } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Search, X, HandHeart } from "lucide-react";
import centroid from "@turf/centroid";
import distance from "@turf/distance";
import { point, polygon } from "@turf/helpers";

interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface PrayerChurch {
  id: string;
  name: string;
}

interface MinistryAreasPanelProps {
  areas: MinistryAreaWithCalling[];
  onAreaClick: (areaId: string) => void;
  selectedCallingTypes?: Set<string>;
  onCallingTypeToggle: (callingType: string | null) => void;
  showAllAreas?: boolean;
  onToggleShowAllAreas?: () => void;
  mapBounds?: MapBounds | null;
  prayerCoverageVisible?: boolean;
  onPrayerCoverageVisibilityChange?: (visible: boolean) => void;
  prayerChurches?: PrayerChurch[];
  onChurchClick?: (churchId: string) => void;
  onAreaHover?: (areaId: string | null) => void;
}

export function MinistryAreasPanel({
  areas,
  onAreaClick,
  selectedCallingTypes = new Set(),
  onCallingTypeToggle,
  showAllAreas,
  onToggleShowAllAreas,
  mapBounds,
  prayerCoverageVisible,
  onPrayerCoverageVisibilityChange,
  prayerChurches = [],
  onChurchClick,
  onAreaHover,
}: MinistryAreasPanelProps) {
  const [searchTerm, setSearchTerm] = useState("");

  // Filter and sort areas by search term, calling types, and distance from map center
  const filteredAreas = useMemo(() => {
    // First filter by calling types and search term
    let filtered = areas.filter(area => {
      if (selectedCallingTypes.size > 0) {
        if (selectedCallingTypes.has("primary")) {
          if (!(area.is_primary === true || area.type === 'primary')) {
            return false;
          }
        } else if (!area.calling_type || !selectedCallingTypes.has(area.calling_type)) {
          return false;
        }
      }
      
      // Then filter by search term
      if (searchTerm.trim()) {
        const search = searchTerm.toLowerCase();
        const areaName = area.name?.toLowerCase() || "";
        const churchName = area.church_name?.toLowerCase() || "";
        return areaName.includes(search) || churchName.includes(search);
      }
      
      return true;
    });
    
    // Sort by distance from map center when bounds are available
    if (mapBounds && filtered.length > 0) {
      const centerLng = (mapBounds.west + mapBounds.east) / 2;
      const centerLat = (mapBounds.south + mapBounds.north) / 2;
      const mapCenter = point([centerLng, centerLat]);
      
      // Calculate centroid and distance for each area
      const areasWithDistance = filtered.map(area => {
        let distanceFromCenter = Infinity;
        
        try {
          if (area.geometry?.coordinates) {
            const areaPolygon = polygon(area.geometry.coordinates);
            const areaCentroid = centroid(areaPolygon);
            distanceFromCenter = distance(mapCenter, areaCentroid, { units: 'miles' });
          }
        } catch (e) {
          // If centroid calculation fails, keep Infinity distance
        }
        
        return { area, distanceFromCenter };
      });
      
      // Sort by distance
      areasWithDistance.sort((a, b) => a.distanceFromCenter - b.distanceFromCenter);
      
      return areasWithDistance.map(item => item.area);
    }
    
    return filtered;
  }, [areas, selectedCallingTypes, searchTerm, mapBounds]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <ScrollArea className="flex-1" style={{ ['--scroll-area-viewport-padding' as string]: '0px' }}>
        <div className="p-4 space-y-4">
          {/* Search Field */}
          <div className="flex items-center gap-2 border rounded-md px-3 bg-background focus-within:ring-1 focus-within:ring-ring">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Search churches or areas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 py-2 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
              data-testid="input-ministry-search"
            />
            {searchTerm && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground flex-shrink-0"
                onClick={() => setSearchTerm("")}
                data-testid="button-clear-ministry-search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Map Mode */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Map Mode</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={showAllAreas ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  onToggleShowAllAreas?.();
                  if (selectedCallingTypes.size > 0) {
                    onCallingTypeToggle(null);
                  }
                }}
                data-testid="button-filter-ministry-areas"
              >
                Ministry Areas
              </Button>
              <Button
                variant={prayerCoverageVisible ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  onPrayerCoverageVisibilityChange?.(!prayerCoverageVisible);
                }}
                data-testid="button-filter-prayer"
              >
                Prayer
              </Button>
            </div>
          </div>

          {/* Ministry Areas List */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Ministry Areas</h3>
            {!showAllAreas ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Toggle "Ministry Areas" above to show ministry areas on the map
              </p>
            ) : filteredAreas.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No ministry areas yet. Draw one on the map!
              </p>
            ) : (
              <div className="space-y-2">
                {filteredAreas.map(area => (
                  <MinistryAreaCard
                    key={area.id}
                    area={area}
                    onShowOnMap={() => onAreaClick(area.id)}
                    onHover={onAreaHover}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Prayer Focus List */}
          {prayerCoverageVisible && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Prayer Focus</h3>
              {prayerChurches.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No churches have set up prayer maps yet
                </p>
              ) : (
                <div className="space-y-2">
                  {prayerChurches.map(church => (
                    <Card
                      key={church.id}
                      className="p-3 cursor-pointer hover-elevate"
                      onClick={() => onChurchClick?.(church.id)}
                      data-testid={`card-prayer-church-${church.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <HandHeart className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{church.name}</p>
                          <p className="text-xs text-muted-foreground">Prayer Focus</p>
                        </div>
                        <Badge variant="secondary" className="text-xs flex-shrink-0">
                          Prayer Map
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </ScrollArea>
    </div>
  );
}
